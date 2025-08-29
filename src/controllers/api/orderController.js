const { body, validationResult } = require("express-validator");
const catchAsync = require("../../utils/catchAsync");
const AppError = require("../../utils/appError");
const User = require("../../models/userModel");

const Order = require("../../models/orderModel");
const { Product } = require("../../models/productModel");
const stripe = require("../../libs/stripe");
const dotenv = require("dotenv");
const Seller = require("../../models/sellerModel");
const orderQueue = require("../../jobs/queues/OrderQueue");
const mongoose = require("mongoose");
const emailQueue = require("../../jobs/queues/EmailQueue");
const { getEmailContent } = require("../../utils/sendMail");
const { PaymentHistory } = require("../../models/paymentCategoryModel");
const Analytic = require("../../models/userAnalyticsModel");
const { getSocket, userSocketMap } = require("../../socket");
const Customer = require("../../models/customerModel");
dotenv.config()

// Calculate total price including shipping and discount
const calcTotalPrice = async (products) => {
    let total = 0;
    let totalDiscount = 0;

    const productIds = products.map(p => p.id);
    const foundProducts = await Product.find({ _id: { $in: productIds } }).lean();

    foundProducts.forEach((product, index) => {

        const amount = Math.round(product.price * 100);
        const shippingFee = product.shipping ? Math.round(product.shipping * 100) : 0;
        // const discount = product.discount ? product.discount * quantity : 0; // assuming discount is per item

        total += (amount + shippingFee) * products[index].quantity;
        // totalDiscount += discount;
    });

    return { total: total / 100, totalDiscount };
};

exports.getOrderByCode = catchAsync(async (req, res, next) => {
    const userId = req.userId;
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
        return next(new AppError("User not found.", 404));
    }
    const orders = await Order.find({ code: req.params.code, userId })
        .populate({ path: "productId", select: "price shipping name images" })
        .lean();

    if (!orders.length) {
        return res.status(404).json({ status: "fail", message: "Order not found", isSuccess: false });
    }

    let totalAmount = 0;
    const ordersWithAmount = orders.map(order => {
        let total = 0;
        if (order.productId && order.productId.price) {
            const amount = Math.round(order.productId.price * 100);
            const shippingFee = (order.productId.shipping * 100)
            total = [(amount + shippingFee) * order.quantity] / 100;
            totalAmount += total;
        }
        return {
            ...order,
            total
        };
    });


    res.status(200).json({
        status: "success",
        order: ordersWithAmount,
        amount: totalAmount,
        isSuccess: true,
    });
});

exports.getOrders = catchAsync(async (req, res, next) => {
    const userId = req.userId
    const user = await User.findById(userId)
    if (!user) {
        return next(new AppError("User not found.", 404))
    }
    const orderCodes = await Order.distinct("code", { userId: user._id });
    const page = req.query.page * 1 || 1;
    const limit = req.query.limit * 1 || 100;
    const skip = (page - 1) * limit;
    const orderStats = await Order.aggregate([
        { $match: { userId: user._id } },
        {
            $lookup: {
                from: "products",
                localField: "productId",
                foreignField: "_id",
                as: "productId"
            }
        },
        { $unwind: { path: "$productId", preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: "$code",
                orderLists: { $sum: 1 },
                status: { $first: "$status" },
                createdAt: { $first: "$createdAt" },
                isDelivered: { $first: "$isDelivered" },
                productId: { $first: "$productId" }
            }
        },
        {
            $addFields: {
                "image": { $first: "$productId.images" }
            }
        },

        {
            $project: {
                code: "$_id",
                orderLists: 1,
                status: 1,
                createdAt: 1,
                image: 1,

                _id: 0
            }
        }
    ]).sort("-createdAt").skip(skip).limit(limit)
    res.status(200).json({
        status: "success",
        orders: orderStats,
        isSuccess: true,
        total: orderCodes.length
    });
})

// cancel order if isn't still checkout within 5 mins
exports.createOrder = [
    body("products", "Invalid Product Id").notEmpty(),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }
        const user = await User.findById(req.userId).lean();
        if (!user) {
            return next(new AppError("You are not authenticated. Please login", 401));
        }
        const { products: productsString } = req.body;

        // Parse and validate products
        let products;
        try {
            products = productsString.split("#").map(id => {
                const [quantity, productId] = id.split("_");
                const parsedQuantity = Number(quantity);




                if (!productId || isNaN(parsedQuantity) || parsedQuantity <= 0) {
                    throw new Error("Invalid product format");
                }

                return { id: productId.trim(), quantity: parsedQuantity };
            });
        } catch (error) {


            next(new AppError("Invalid product format", 400));
        }

        if (!products || products.length === 0) {
            next(new AppError("Please add products id and quantity", 400));
        }

        const productMap = {};
        products.forEach(({ id, quantity }) => {
            if (productMap[id]) {
                productMap[id] += quantity;
            } else {
                productMap[id] = quantity;
            }
        });

        products = Object.entries(productMap).map(([id, quantity]) => ({ id, quantity }));

        // Validate ObjectIds
        const productIds = products.map(p => p.id);
        for (const productId of productIds) {
            if (!mongoose.Types.ObjectId.isValid(productId)) {
                return next(new AppError("Invalid Product Id", 400));
            }
        }

        // Start transaction for data consistency
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find products with session for consistency
            const foundProducts = await Product.find({
                _id: { $in: productIds }
            }).session(session);

            if (!foundProducts || foundProducts.length === 0) {
                return next(new AppError("No products found.", 404));
            }

            if (foundProducts.length !== products.length) {
                const foundIds = foundProducts.map(p => p._id.toString());
                const missingIds = productIds.filter(id => !foundIds.includes(id));
                return next(new AppError(`Products not found: ${missingIds.join(', ')}`, 404));
            }

            // Check inventory availability (but don't reduce it yet)
            const orderProducts = [];

            for (const product of foundProducts) {
                const orderedProduct = products.find(p => p.id === product._id.toString());

                if (!orderedProduct) {
                    continue;
                }

                // ONLY CHECK inventory availability - don't reduce it
                if (product.inventory < orderedProduct.quantity) {
                    await session.abortTransaction();
                    session.endSession();
                    return next(new AppError(
                        `Insufficient inventory for product ${product.name || product._id}. Available: ${product.inventory}, Requested: ${orderedProduct.quantity}`,
                        400
                    ));
                }

                orderProducts.push({
                    id: product._id.toString(),
                    quantity: orderedProduct.quantity,
                    merchant: product.merchant,
                    price: product.price,
                    name: product.name
                });
            }

            // Create orders (without reducing inventory)
            const code = `ORD-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
            const orders = orderProducts.map((product) => ({
                code,
                userId: user._id,
                productId: product.id,
                quantity: product.quantity,
                merchant: product.merchant,
                price: product.price,
                status: 'pending',
                isPaid: false,
                inventoryReserved: false, // Track reservation status
                createdAt: new Date()
            }));

            await Order.insertMany(orders, { session });

            // Add job to queue for order expiration cleanup
            await orderQueue.add(
                `order-expiration`,
                { code },
                {
                    delay: 5 * 60 * 1000, // 5 minutes
                    jobId: `order:${code}`,
                    removeOnComplete: 100,
                    removeOnFail: 50
                }
            );
            // Calculate total price
            const { total, totalDiscount } = await calcTotalPrice(orderProducts);

            // Commit transaction
            await session.commitTransaction();
            session.endSession();

            res.status(201).json({
                status: "success",
                total,
                discount: totalDiscount,
                code,
                orderCount: orders.length,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
                isSuccess: true
            });

        } catch (error) {
            await session.abortTransaction();
            session.endSession();

            console.error('Order creation failed:', error);
            next(new AppError("Failed to create order. Please try again.", 500));
        }
    }),
];


exports.createCheckoutSession = [
    body("code", "Order code is required.").notEmpty(),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        const { code } = req.body;
        const userId = req.userId;

        const session = await mongoose.startSession();

        try {
            let stripeSession;
            let orders;
            let lineItems = [];
            let totalAmount = 0;
            let totalShipping = 0;


            orders = await Order.find({
                code,
                status: "pending",
                userId: userId,
                isPaid: false
            }).session(session).lean();

            if (!orders?.length) {
                throw new AppError("Invalid order code or no pending orders found.", 400);
            }


            const ORDER_EXPIRY_MINUTES = 5;
            const PAYMENT_EXPIRY_MINUTES = 30;
            const MIN_PAYMENT_AMOUNT = 1000; // cents

            const orderAge = Date.now() - new Date(orders[0].createdAt).getTime();
            const expiryTime = ORDER_EXPIRY_MINUTES * 60 * 1000;

            if (orderAge > expiryTime) {
                throw new AppError("Order has expired. Please create a new order.", 400);
            }

            if (orders[0].inventoryReserved && orders[0].stripeSessionId) {
                try {
                    stripeSession = await stripe.checkout.sessions.retrieve(orders[0].stripeSessionId);

                    // Check if session is still valid
                    if (stripeSession.status === 'open') {
                        return res.status(200).json({
                            status: "success",
                            sessionId: stripeSession.id,
                            url: stripeSession.url,
                            currency: "MMK",
                            orderCode: code,
                            expiresAt: new Date((stripeSession.expires_at) * 1000),
                            isSuccess: true,
                            message: "Existing checkout session retrieved"
                        });
                    }
                } catch (stripeError) {
                    // If session retrieval fails, proceed to create new session
                    console.warn(`Failed to retrieve Stripe session: ${stripeError.message}`);
                }
            }

            await session.withTransaction(async () => {
                const productIds = orders.map(order => order.productId);
                const products = await Product.find({
                    _id: { $in: productIds }
                }).select('name images price shipping inventory reservedInventory')
                    .session(session)
                    .lean();
                if (!products?.length) {
                    throw new AppError("No valid products found for this order.", 400);
                }
                if (products.length !== productIds.length) {
                    throw new AppError("Some products in the order are no longer available.", 400);
                }
                // Create product map for efficient lookup
                const productMap = new Map(
                    products.map(product => [product._id.toString(), product])
                );
                // Process orders and validate inventory
                const inventoryUpdates = [];

                for (const order of orders) {
                    const product = productMap.get(order.productId.toString());

                    if (!product) {
                        throw new AppError(`Product not found for order item: ${order.productId}`, 400);
                    }

                    // Enhanced product validation
                    if (!product.name?.trim() || !product.images.length) {
                        throw new AppError(`Product ${product.name || product._id} is missing required information`, 400);
                    }

                    if (typeof product.price !== 'number' || product.price <= 0) {
                        throw new AppError(`Product ${product.name} has invalid price`, 400);
                    }

                    // Check available inventory (considering already reserved)
                    const availableInventory = product.inventory || 0;
                    if (availableInventory < order.quantity) {
                        throw new AppError(
                            `Insufficient inventory for ${product.name}. Available: ${availableInventory}, Required: ${order.quantity}`,
                            400
                        );
                    }

                    // Prepare inventory update
                    inventoryUpdates.push({
                        updateOne: {
                            filter: {
                                _id: product._id,
                                inventory: { $gte: order.quantity }
                            },
                            update: {
                                $inc: {
                                    inventory: -order.quantity,
                                    reservedInventory: order.quantity
                                }
                            }
                        }
                    });

                    // Calculate pricing (improved precision handling)
                    const unitPrice = Math.round(product.price * 100);
                    const shippingFee = product.shipping ? Math.round(product.shipping * 100) : 0;
                    const totalUnitAmount = unitPrice + shippingFee;
                    const lineTotal = totalUnitAmount * order.quantity;

                    totalAmount += lineTotal;
                    totalShipping += (shippingFee * order.quantity);

                    // Build line items for Stripe
                    lineItems.push({
                        price_data: {
                            currency: "mmk",
                            product_data: {
                                name: product.name,
                                images: product.images.slice(0, 1), // Stripe accepts max 8 images, use first one
                                metadata: {
                                    productId: product._id.toString()
                                }
                            },
                            unit_amount: totalUnitAmount,
                        },
                        quantity: order.quantity,
                    });
                }

                // Validate minimum payment amount
                if (totalAmount < MIN_PAYMENT_AMOUNT) {
                    throw new AppError(`Order amount (${totalAmount / 100} MMK) is below minimum required (${MIN_PAYMENT_AMOUNT / 100} MMK).`, 400);
                }

                // Execute atomic inventory updates using bulkWrite
                const inventoryResults = await Product.bulkWrite(inventoryUpdates, {
                    session,
                    ordered: true // Stop on first failure
                });

                // Verify all inventory updates succeeded
                if (inventoryResults.modifiedCount !== inventoryUpdates.length) {
                    throw new AppError("Unable to reserve inventory. Some items may no longer be available.", 400);
                }

                // Update orders to mark inventory as reserved
                const orderUpdateResult = await Order.updateMany(
                    { code, userId: userId }, // Add userId for security
                    {
                        $set: {
                            inventoryReserved: true,
                            reservedAt: new Date()
                        }
                    },
                    { session }
                );

                if (orderUpdateResult.modifiedCount === 0) {
                    throw new AppError("Failed to update order status", 500);
                }
            });

            // Create Stripe checkout session (outside transaction)
            const expiresAt = Math.floor(Date.now() / 1000) + (30 * 60);

            stripeSession = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                line_items: lineItems,
                mode: "payment",
                success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL}/payment-cancel?order_code=${code}`,
                expires_at: expiresAt,
                metadata: {
                    userId: userId.toString(),
                    orderCode: code,
                    totalShipping: (totalShipping / 100).toFixed(2),
                    totalAmount: (totalAmount / 100).toFixed(2),
                    orderCount: orders.length.toString(),
                    createdAt: new Date().toISOString()
                },
                customer_email: req.user?.email,
                billing_address_collection: 'required',
                shipping_address_collection: {
                    allowed_countries: ['MM'],
                },
                payment_intent_data: {
                    metadata: {
                        orderCode: code,
                        userId: userId.toString()
                    }
                }
            });

            // Store session ID (separate operation to avoid transaction conflicts)
            await Order.updateMany(
                { code, userId: userId },
                {
                    $set: {
                        stripeSessionId: stripeSession.id,
                        sessionCreatedAt: new Date(),
                        sessionExpiresAt: new Date(expiresAt * 1000)
                    }
                }
            );

            // Return success response
            res.status(200).json({
                status: "success",
                sessionId: stripeSession.id,
                url: stripeSession.url,
                totalAmount: totalAmount,
                totalShipping: totalShipping,
                currency: "MMK",
                orderCode: code,
                expiresAt: new Date(expiresAt * 1000),
                itemCount: orders.length,
                isSuccess: true
            });

        } catch (error) {
            // Enhanced error handling
            console.error('Checkout session creation error:', {
                error: error.message,
                code: error.code,
                type: error.type,
                orderCode: req.body.code,
                userId: userId
            });

            if (error instanceof AppError) {
                return next(error);
            }

            // Handle Stripe-specific errors with more granular responses
            switch (error.type) {
                case 'StripeCardError':
                    return next(new AppError('Payment processing error. Please check your card details.', 400));
                case 'StripeInvalidRequestError':
                    return next(new AppError('Invalid payment request. Please verify your order details.', 400));
                case 'StripeConnectionError':
                    return next(new AppError('Payment service temporarily unavailable. Please try again.', 503));
                case 'StripeAPIError':
                case 'StripeAuthenticationError':
                case 'StripePermissionError':
                    return next(new AppError('Payment service error. Please try again later.', 503));
                case 'StripeRateLimitError':
                    return next(new AppError('Too many requests. Please wait a moment and try again.', 429));
                default:
                    return next(new AppError('An unexpected error occurred. Please try again.', 500));
            }
        } finally {
            await session.endSession();
        }
    }),
];

exports.cashOnDelivery = [
    body("code", "Order code is required.").notEmpty(),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        const userId = req.userId
        const user = await Customer.findById(userId)

        const { code } = req.body

        const orders = await Order.find({
            code,
            status: "pending",
            userId: userId,
            isPaid: false,
        })

        if (!orders || orders.length === 0) {
            throw new AppError("Invalid order code or no pending orders found.", 400);
        }
        const orderAge = Date.now() - new Date(orders[0].createdAt).getTime();
        const fiveMinutes = 5 * 60 * 1000;
        if (orderAge > fiveMinutes) {
            throw new AppError("Order has expired. Please create a new order.", 400);
        }



        const productIds = orders.map(order => order.productId);

        const products = await Product.find({
            _id: { $in: productIds }
        }).select("_id merchant inventory name")

        if (!products || products.length === 0) {
            throw new AppError("No valid products found for this order.", 400);
        }


        if (products.length !== productIds.length) {
            throw new AppError("Some products in the order are no longer available.", 400);
        }

        const productMap = {};
        products.forEach(product => {
            productMap[product._id.toString()] = product;
        });


        for (const order of orders) {
            const product = productMap[order.productId.toString()];

            if (!product) {
                throw new AppError(`Product not found for order item: ${order.productId}`, 400);
            }

            // Validate product has required fields
            if (!product.name) {
                throw new AppError(`Product ${product.name || product._id} is missing required information`, 400);
            }

            // Check inventory before attempting to reserve
            if (product.inventory < order.quantity) {
                throw new AppError(
                    `Insufficient inventory for ${product.name}. Available: ${product.inventory}, Required: ${order.quantity}`,
                    400
                );
            }
        }

        await orderQueue.remove(`order:${code}`);

        if (orders[0].inventoryReserved) {
            const mongoSession = await mongoose.startSession();
            try {
                await mongoSession.withTransaction(async () => {
                    for (const order of orders) {
                        await Product.updateOne(
                            { _id: order.productId },
                            {
                                $inc: {
                                    inventory: order.quantity,
                                    reservedInventory: -order.quantity
                                }
                            },
                            { session: mongoSession }
                        );
                    }
                });
            } catch (error) {
                console.error(error);
                try {
                    await mongoSession.abortTransaction();
                } catch (abortError) {
                    console.error('Abort transaction error:', abortError);
                }
            } finally {
                await mongoSession.endSession();
            }
        }
        await Order.updateMany({ code }, { status: "order placed", payment: "cod" })

        if (products.length > 0) {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);

            await Promise.all(
                products.map(async (product) => {
                    const isAlreadyExist = await Analytic.findOne({
                        product: product._id,
                        user: req.userId,
                        category: product.category,
                        status: "order",
                        createdAt: { $gte: startOfDay, $lte: endOfDay }
                    });

                    if (!isAlreadyExist) {
                        await Analytic.create({
                            user: req.userId,
                            product: product._id,
                            status: "order",
                            category: product.category
                        });
                    }
                })
            );
        }

        const io = getSocket();
        products.map((product) => {
            const merchantId = userSocketMap.get(product.merchant)
            io.to(merchantId).emit("push-notification", {
                message: "You have new cash on delivery order. Please check.",
                link: "/dashboard/orders"
            })
        })

        // const data = {
        //     customerName: user.name,
        //     customerPhone: user?.phone ?? "",
        //     totalProducts: order.quantity,


        // }

        // const emailContent = await getEmailContent({
        //     filename: "customerCod",
        //     data: data
        // });

        // await emailQueue.add(
        //     "email-user",
        //     {
        //         receiver: email, // Make this dynamic
        //         subject: "You have a new Order",
        //         html: emailContent,
        //     },
        //     { removeOnComplete: true, removeOnFail: 1000 }
        // );


        res.status(200).json({ message: "Cash on delivery success. Please wait for merchant confirm.", isSuccess: true, })

    })
]

exports.checkoutSuccess = [
    body("sessionId", "Invalid Session Id").notEmpty(),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        const { sessionId } = req.body;

        const session = await stripe.checkout.sessions.retrieve(sessionId);



        if (!session) {
            return next(new AppError("Session not found!", 400));
        }

        if (session.payment_status !== "paid") {
            return next(new AppError("Payment not completed", 400));
        }

        const orderCode = session.metadata.orderCode;
        const userId = session.metadata.userId;
        const totalAmount = session.metadata.totalAmount;

        // Find orders
        const orders = await Order.find({
            code: orderCode,
            userId: userId
        });

        if (!orders || orders.length === 0) {
            return next(new AppError("Invalid order code", 400));
        }

        // Check if already processed to prevent duplicate processing
        if (orders[0].isPaid) {
            return res.status(200).json({
                status: "success",
                isSuccess: true,
                orderCode,
                totalAmount: session.metadata.totalAmount,
                message: "Order already processed"
            });
        }

        // Start transaction for atomic processing
        const mongoSession = await mongoose.startSession();

        try {
            let shouldRefund = false;
            let refundReason = [];

            await mongoSession.withTransaction(async () => {
                // Get product IDs for inventory checking
                const productIds = orders.map(order => order.productId);
                const products = await Product.find({
                    _id: { $in: productIds }
                }).session(mongoSession);

                // Create product lookup map
                const productMap = {};
                products.forEach(product => {
                    productMap[product._id.toString()] = product;
                });

                // Check if inventory was already reserved during checkout
                const hasReservedInventory = orders[0].inventoryReserved;

                if (hasReservedInventory) {
                    // Inventory was reserved - just convert to sold
                    const inventoryOps = [];
                    // const merchantTotals = {};
                    const merchantData = {}

                    for (const order of orders) {
                        const product = productMap[order.productId.toString()];
                        if (!product) continue;

                        // Convert reserved inventory to sold
                        inventoryOps.push({
                            updateOne: {
                                filter: { _id: order.productId },
                                update: {
                                    $inc: {
                                        reservedInventory: -order.quantity,
                                        soldCount: order.quantity
                                    }
                                }
                            }
                        });

                        // Calculate merchant earnings
                        if (product.merchant) {
                            if (!merchantData?.merchantId) {
                                merchantData.amount = 0;
                            }
                            merchantData.amount += totalAmount;
                            merchantData.merchantId = product.merchant
                            merchantData.customer = userId
                            merchantData.orderCode = orderCode
                        }
                    }

                    // Execute inventory updates
                    if (inventoryOps.length > 0) {
                        await Product.bulkWrite(inventoryOps, { session: mongoSession });
                    }

                    // Update merchant balances
                    await updateMerchantBalances(merchantData, mongoSession);

                } else {
                    // No reservation - need to check and deduct inventory atomically

                    const inventoryOps = [];
                    // const merchantTotals = {};
                    const merchantData = {}

                    for (const order of orders) {
                        const product = productMap[order.productId.toString()];
                        if (!product) {
                            shouldRefund = true;
                            refundReason.push(`Product ${order.productId} not found`);
                            continue;
                        }

                        // Atomic inventory check and deduction
                        const updateResult = await Product.updateOne(
                            {
                                _id: order.productId,
                                inventory: { $gte: order.quantity } // Only update if sufficient inventory
                            },
                            {
                                $inc: {
                                    inventory: -order.quantity,
                                    soldCount: order.quantity
                                }
                            },
                            { session: mongoSession }
                        );

                        // If no document was modified, insufficient inventory
                        if (updateResult.modifiedCount === 0) {
                            shouldRefund = true;
                            refundReason.push(`${product.name} - insufficient inventory`);
                            continue;
                        }

                        // Calculate merchant earnings for successful orders
                        if (product.merchant) {
                            if (!merchantData?.merchantId) {
                                merchantData.amount = 0;
                            }
                            merchantData.amount += totalAmount;
                            merchantData.merchantId = product.merchant
                            merchantData.customer = userId
                            merchantData.orderCode = orderCode
                        }
                    }

                    // Update merchant balances only for successful orders
                    if (!shouldRefund) {
                        await updateMerchantBalances(merchantData, mongoSession);
                    }
                }

                // Update orders based on success/failure
                const orderUpdateData = {
                    stripeSessionId: stripe.payment_intent,
                    payment: "stripe",
                    processedAt: new Date()
                };

                if (shouldRefund) {
                    orderUpdateData.status = "refund";
                    orderUpdateData.refundReason = refundReason.join(', ');
                } else {
                    orderUpdateData.isPaid = true;
                    orderUpdateData.status = "confirmed";
                    orderUpdateData.paidAt = new Date();
                }

                await Order.updateMany(
                    { code: orderCode },
                    { $set: orderUpdateData },
                    { session: mongoSession }
                );


                if (products.length > 0) {
                    const startOfDay = new Date();
                    startOfDay.setHours(0, 0, 0, 0);

                    const endOfDay = new Date();
                    endOfDay.setHours(23, 59, 59, 999);

                    await Promise.all(
                        products.map(async (product) => {


                            const isAlreadyExist = await Analytic.findOne({
                                product: product._id,
                                user: req.userId,
                                category: product.category,
                                createdAt: { $gte: startOfDay, $lte: endOfDay }
                            });

                            if (!isAlreadyExist) {
                                await Analytic.create({
                                    user: req.userId,
                                    product: product._id,
                                    status: "purchase",
                                    category: product.category
                                });
                            }
                        })
                    );
                }

                const date = new Date();

                const formattedDate = date.toLocaleString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true
                });

                const data = {
                    orderCode,
                    totalProducts: products.length,
                    totalAmount,
                    date: formattedDate
                };

                const user = await User.findById(orders[0].userId).select("email")

                // Send success email
                await sendOrderConfirmationEmail(user.email, data);



                // Update product status for zero inventory items (only if not refunding)
                if (!shouldRefund) {
                    await updateZeroInventoryProducts(productIds, mongoSession);
                }
            });

            // Handle refund outside transaction if needed
            if (shouldRefund) {
                await processRefund(session, orderCode, refundReason);

                return res.status(200).json({
                    status: "success",
                    isSuccess: false,
                    orderCode,
                    message: "Order refunded due to insufficient inventory",
                    refundReason: refundReason.join(', ')
                });
            }



        } catch (error) {
            console.error('Checkout processing failed:', error);
            return next(new AppError("Checkout processing failed", 500));
        } finally {
            await mongoSession.endSession();
        }

        // Remove order from expiration queue (successful payment)
        try {
            await orderQueue.remove(`order:${orderCode}`);
        } catch (queueError) {
            console.error('Failed to remove order from queue:', queueError);
        }



        res.status(200).json({
            status: "success",
            isSuccess: true,
            orderCode,
            totalAmount: session.metadata.totalAmount
        });
    }),
];

async function updateMerchantBalances(merchantData, mongoSession) {
    if (Object.keys(merchantData).length === 0) return;

    // const merchantOps = Object.entries(merchantTotals).map(([merchantId, amount]) => ({
    //     updateOne: {
    //         filter: { _id: merchantId },
    //         update: { $inc: { balance: amount } }
    //     }
    // }));

    const merchantOps = [
        {
            updateOne: {
                filter: { _id: merchantData.merchantId },
                update: { $inc: { balance: merchantData.amount } }
            }
        }
    ];

    await Seller.bulkWrite(merchantOps, { session: mongoSession });



    const paymentHistoryOps = [
        {
            insertOne: {
                document: {
                    customer: merchantData.customer,
                    paymentMethod: "stripe",
                    amount: merchantData.amount,
                    orderCode: merchantData.orderCode,
                    merchant: merchantData.merchantId,
                    status: "income"
                }
            }
        }
    ];

    await PaymentHistory.bulkWrite(paymentHistoryOps, { session: mongoSession });

}

async function updateZeroInventoryProducts(productIds, mongoSession) {
    const zeroInventoryProducts = await Product.find({
        _id: { $in: productIds },
        inventory: { $lte: 0 }
    }).session(mongoSession);

    if (zeroInventoryProducts.length > 0) {
        const statusUpdateOps = zeroInventoryProducts.map(product => ({
            updateOne: {
                filter: { _id: product._id },
                update: { $set: { status: 'out_of_stock' } }
            }
        }));

        await Product.bulkWrite(statusUpdateOps, { session: mongoSession });
    }
}

async function processRefund(session, orderCode, refundReason) {
    try {
        const refund = await stripe.refunds.create({
            payment_intent: session.payment_intent,
            reason: 'requested_by_customer',
            metadata: {
                orderCode: orderCode,
                reason: 'insufficient_inventory'
            }
        });

        // Update orders with refund information
        await Order.updateMany(
            { code: orderCode },
            {
                $set: {
                    status: 'refunded',
                    stripeRefundId: refund.id,
                    refundedAt: new Date()
                }
            }
        );


    } catch (refundError) {
        console.error('Refund processing failed:', refundError);

        // Mark refund as failed for manual processing
        await Order.updateMany(
            { code: orderCode },
            {
                $set: {
                    status: 'refund_failed',
                    refundError: refundError.message
                }
            }
        );
    }
}

async function sendOrderConfirmationEmail(email, data) {
    try {


        const emailContent = await getEmailContent({
            filename: "orderSuccess.html",
            data: data
        });



        await emailQueue.add(
            "email-user",
            {
                receiver: email, // Make this dynamic
                subject: "Ayeyar Market Order Confirmation",
                html: emailContent,
            },
            { removeOnComplete: true, removeOnFail: 1000 }
        );
    } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
    }
}
