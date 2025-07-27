const { body, validationResult } = require("express-validator");
const catchAsync = require("../../utils/catchAsync");
const AppError = require("../../utils/appError");
const User = require("../../models/userModel");

const Order = require("../../models/orderModel");
const Cart = require("../../models/cartModel");
const { Product } = require("../../models/productModel");
const stripe = require("../../libs/stripe");
const dotenv = require("dotenv");
const Seller = require("../../models/sellerModel");
const orderQueue = require("../../jobs/queues/OrderQueue");
const mongoose = require("mongoose");
const ApiFeature = require("../../utils/apiFeatures");
const emailQueue = require("../../jobs/queues/EmailQueue");
const { getEmailContent } = require("../../utils/sendMail");
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
    ]).skip(skip).limit(limit).sort("-createdAt")
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
                    delay: 1 * 60 * 1000, // 5 minutes
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
    body("payment", "Payment type is required").notEmpty(),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        const { code, payment } = req.body;
        const userId = req.userId;


        const session = await mongoose.startSession();
        try {
            let stripeSession;
            let orders;
            let lineItems = [];
            let totalAmount = 0;
            let totalShipping = 0;

            await session.withTransaction(async () => {
                orders = await Order.find({
                    code,
                    status: "pending",
                    userId: userId,
                    isPaid: false
                }).session(session);

                if (!orders || orders.length === 0) {
                    throw new AppError("Invalid order code or no pending orders found.", 400);
                }
                const orderAge = Date.now() - new Date(orders[0].createdAt).getTime();
                const fiveMinutes = 5 * 60 * 1000;
                if (orderAge > fiveMinutes) {
                    throw new AppError("Order has expired. Please create a new order.", 400);
                }
                if (orders[0].inventoryReserved) {
                    throw new AppError("Inventory already reserved for this order. Please complete payment or create a new order.", 400);
                }

                const productIds = orders.map(order => order.productId);

                // Find products and validate they exist
                const products = await Product.find({
                    _id: { $in: productIds }
                }).session(session);

                if (!products || products.length === 0) {
                    throw new AppError("No valid products found for this order.", 400);
                }

                // Validate all products exist before proceeding
                if (products.length !== productIds.length) {
                    throw new AppError("Some products in the order are no longer available.", 400);
                }

                // Create a map for efficient product lookup
                const productMap = {};
                products.forEach(product => {
                    productMap[product._id.toString()] = product;
                });

                // Validate inventory and reserve it atomically
                for (const order of orders) {
                    const product = productMap[order.productId.toString()];

                    if (!product) {
                        throw new AppError(`Product not found for order item: ${order.productId}`, 400);
                    }

                    // Validate product has required fields
                    if (!product.name || !product.images || product.images.length === 0) {
                        throw new AppError(`Product ${product.name || product._id} is missing required information`, 400);
                    }

                    // Check inventory before attempting to reserve
                    if (product.inventory < order.quantity) {
                        throw new AppError(
                            `Insufficient inventory for ${product.name}. Available: ${product.inventory}, Required: ${order.quantity}`,
                            400
                        );
                    }

                    // ATOMIC INVENTORY CHECK AND RESERVATION
                    const updateResult = await Product.updateOne(
                        {
                            _id: product._id,
                            inventory: { $gte: order.quantity } // Only update if sufficient inventory
                        },
                        {
                            $inc: {
                                inventory: -order.quantity,
                                reservedInventory: order.quantity // Track reserved items
                            }
                        },
                        { session }
                    );

                    // If no document was modified, insufficient inventory (race condition)
                    if (updateResult.modifiedCount === 0) {
                        throw new AppError(
                            `Insufficient inventory for ${product.name}. Please try again.`,
                            400
                        );
                    }

                    // Calculate amounts in cents for Stripe
                    const unitPrice = Math.round(product.price * 100);
                    const shippingFee = product.shipping ? Math.round(product.shipping * 100) : 0;
                    const totalUnitAmount = unitPrice + shippingFee;
                    const lineTotal = totalUnitAmount * order.quantity;

                    totalAmount += lineTotal;
                    totalShipping += (shippingFee * order.quantity);

                    lineItems.push({
                        price_data: {
                            currency: "mmk",
                            product_data: {
                                name: product.name,
                                images: [product.images[0]],
                            },
                            unit_amount: totalUnitAmount,
                        },
                        quantity: order.quantity,
                    });
                }

                // Update orders to mark inventory as reserved
                await Order.updateMany(
                    { code },
                    {
                        $set: {
                            inventoryReserved: true,
                            reservedAt: new Date()
                        }
                    },
                    { session }
                );

                // Minimum amount validation (Stripe requirement)
                if (totalAmount < 1000) {
                    throw new AppError("Order amount is too small for payment processing.", 400);
                }
            });

            // Create Stripe checkout session (outside transaction to avoid blocking)
            stripeSession = await stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                line_items: lineItems,
                mode: "payment",
                success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL}/payment-cancel?order_code=${code}`,
                expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes expiry
                metadata: {
                    userId: userId.toString(),
                    orderCode: code,
                    totalShipping: (totalShipping / 100).toString(),
                    totalAmount: (totalAmount / 100).toString(),
                    orderCount: orders.length.toString(),
                },
                customer_email: req.user.email,
                billing_address_collection: 'required',
                shipping_address_collection: {
                    allowed_countries: ['MM'],
                },
            });

            // Store session ID for tracking (separate transaction to avoid conflicts)
            await Order.updateMany(
                { code },
                {
                    $set: {
                        stripeSessionId: stripeSession.id,
                        sessionCreatedAt: new Date()
                    }
                }
            );

            res.status(200).json({
                status: "success",
                sessionId: stripeSession.id,
                url: stripeSession.url,
                totalAmount: totalAmount,
                totalShipping: totalShipping,
                currency: "MMK",
                orderCode: code,
                expiresAt: new Date((Math.floor(Date.now() / 1000) + (30 * 60)) * 1000),
                itemCount: orders.length,
                isSuccess: true
            });

        } catch (error) {

            if (error instanceof AppError) {
                return next(error);
            }
            // Handle specific Stripe errors
            if (error.type === 'StripeCardError') {
                return next(new AppError('Payment processing error. Please try again.', 400));
            } else if (error.type === 'StripeInvalidRequestError') {
                return next(new AppError('Invalid payment request. Please check your order details.', 400));
            } else if (error.type === 'StripeConnectionError') {
                return next(new AppError('Payment service connection error. Please try again.', 503));
            } else if (error.type === 'StripeAPIError') {
                return next(new AppError('Payment service error. Please try again later.', 503));
            } else {
                return next(new AppError('Payment service unavailable. Please try again later.', 503));
            }
        } finally {
            await session.endSession();
        }
    }),
];

exports.checkoutSuccess = [
    body("sessionId", "Invalid Session Id").notEmpty(),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        const { sessionId } = req.body;

        // Retrieve session details
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (!session) {
            return next(new AppError("Session not found!", 400));
        }

        if (session.payment_status !== "paid") {
            return next(new AppError("Payment not completed", 400));
        }

        const orderCode = session.metadata.orderCode;
        const userId = session.metadata.userId;

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
                    const merchantTotals = {};

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
                            if (!merchantTotals[product.merchant]) {
                                merchantTotals[product.merchant] = 0;
                            }
                            merchantTotals[product.merchant] += order.quantity * product.price;
                        }
                    }

                    // Execute inventory updates
                    if (inventoryOps.length > 0) {
                        await Product.bulkWrite(inventoryOps, { session: mongoSession });
                    }

                    // Update merchant balances
                    await updateMerchantBalances(merchantTotals, mongoSession);

                } else {
                    // No reservation - need to check and deduct inventory atomically
                    const inventoryOps = [];
                    const merchantTotals = {};

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
                            if (!merchantTotals[product.merchant]) {
                                merchantTotals[product.merchant] = 0;
                            }
                            merchantTotals[product.merchant] += order.quantity * product.price;
                        }
                    }

                    // Update merchant balances only for successful orders
                    if (!shouldRefund) {
                        await updateMerchantBalances(merchantTotals, mongoSession);
                    }
                }

                // Update orders based on success/failure
                const orderUpdateData = {
                    stripeSessionId: sessionId,
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

        // Send success email
        await sendOrderConfirmationEmail(orders[0].userId, orderCode);

        res.status(200).json({
            status: "success",
            isSuccess: true,
            orderCode,
            totalAmount: session.metadata.totalAmount
        });
    }),
];

// Helper function to update merchant balances
async function updateMerchantBalances(merchantTotals, mongoSession) {
    if (Object.keys(merchantTotals).length === 0) return;

    const merchantOps = Object.entries(merchantTotals).map(([merchantId, amount]) => ({
        updateOne: {
            filter: { _id: merchantId },
            update: { $inc: { balance: amount } }
        }
    }));

    await Seller.bulkWrite(merchantOps, { session: mongoSession });
}

// Helper function to update zero inventory products
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

// Helper function to process refunds
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

        console.log(`Order ${orderCode} refunded: ${refundReason.join(', ')}`);

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

// Helper function to send confirmation email
async function sendOrderConfirmationEmail(userId, orderCode) {
    try {
        const email = await getEmailContent({
            filename: "orderSuccess.html",
            data: { orderCode }
        });

        await emailQueue.add(
            "email-user",
            {
                receiver: "tuntunmyint10182003@gmail.com", // Make this dynamic
                subject: "Ayeyar Market Order Confirmation",
                html: email,
            },
            { removeOnComplete: true, removeOnFail: 1000 }
        );
    } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
    }
}
