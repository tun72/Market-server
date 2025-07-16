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

    return { total: total / 100 };
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

        let products = productsString.split("#").map(id => {
            const [quantity, productId] = id.split("_");
            return { id: productId, quantity: Number(quantity) };
        });

        if (products && !products.length > 0) {
            return next(new AppError("Please add products id and quantity", 400))
        }

        // // Merge duplicate products by summing their quantities
        const productMap = {};
        products.forEach(({ id, quantity }) => {
            if (productMap[id]) {
                productMap[id] += quantity;
            } else {
                productMap[id] = quantity;
            }
        });

        products = Object.entries(productMap).map(([id, quantity]) => ({ id, quantity }));

        const productIds = products.map(p => p.id);

        for (const productId of productIds) {
            if (!mongoose.Types.ObjectId.isValid(productId)) {
                return next(new AppError("Invalid Product Id", 404));
            }
        }

        const foundProducts = await Product.find({ _id: { $in: productIds } }).lean();

        if (!foundProducts) {
            return next(new AppError("No products ound.", 400))
        }

        for (const [index, product] of foundProducts.entries()) {
            const orderedProduct = products.find(p => p.id === String(product._id));

            if (orderedProduct && product.inventory < orderedProduct.quantity) {
                return next(new AppError("The product reached limit", 400));
            }
            if (orderedProduct) {
                products[index].merchant = product.merchant;
            }
        }


        // Prepare bulk update for product inventory
        const bulkOps = products.map((product) => ({
            updateOne: {
                filter: { _id: product.id },
                update: { $inc: { inventory: -product.quantity } }
            }
        }));

        if (bulkOps.length > 0) {
            await Product.bulkWrite(bulkOps);
        }

        if (foundProducts.length !== products.length) {
            return next(new AppError("Products not found", 404));
        }

        const cart = await Cart.findOne({ userId: user._id });

        if (cart) {
            await Cart.updateOne(
                { _id: cart._id, userId: user._id },
                { $pull: { products: { productId: { $in: productIds } } } }
            );
        }
        const orders = []

        const code = `ORD-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`

        products.forEach((product) => {
            const order = {
                code,
                userId: user._id,
                productId: product.id,
                quantity: product.quantity,
                merchant: product.merchant,
            }
            orders.push(order)
        })

        await Order.insertMany(orders)

        await orderQueue.add(
            `order:${code}`,
            { code },
            { delay: 1000 * 60 * 3, jobId: `order:${code}` } // 5-minute delay 300000
        );

        const { total, totalDiscount } = await calcTotalPrice(products);

        res.status(201).json({
            status: "success",
            total,
            discount: totalDiscount,
            code,
            isSuccess: true
        });
    }),
];

// order cancel

// checkout
exports.createCheckoutSession = [
    body("code", "Order code is required.").notEmpty(),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        const code = req.body.code;

        const orders = await Order.find({ code, status: "pending" })

        if (!orders.length > 0) {
            return next(new AppError("Invalid order code.", 400))
        }


        const productIds = orders.map((order) => order.productId)


        const products = await Product.find({ _id: { $in: productIds } }).lean();


        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ error: "Invalid or empty products" });
        }

        let totalAmount = 0;

        const lineItems = products.map((product, index) => {
            const amount = Math.round(product.price * 100);
            const shippingFee = product.shipping ? Math.round(product.shipping * 100) : 0;
            totalAmount += (amount + shippingFee) * orders[index].quantity;

            return {
                price_data: {
                    currency: "mmk",
                    product_data: {
                        name: product.name,
                        images: [product.images[0]]
                    },
                    unit_amount: amount + shippingFee,
                },
                quantity: orders[index].quantity || 1,
            };
        });

        // let coupon = null;
        // if (couponCode) {
        //     coupon = await Coupon.findOne({ code: couponCode, userId: req.user._id, isActive: true });
        //     if (coupon) {
        //         totalAmount -= Math.round((totalAmount * coupon.discountPercentage) / 100);
        //     }
        // }

        // Calculate total shipping fee
        const totalShipping = products.reduce((sum, product, idx) => {
            const quantity = orders[idx].quantity || 1;
            return sum + ((product.shipping || 0) * quantity);
        }, 0);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: lineItems,
            mode: "payment",
            success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
            metadata: {
                userId: req.user._id.toString(),
                orderCode: code,
                totalShipping: totalShipping,
                totalAmount: totalAmount
            },
        });

        // Add shipping fee to response
        res.status(200).json({
            status: "success",
            id: session.id,
            totalAmount: totalAmount / 100,
            shipping: totalShipping,
            url: session.url,
            isSuccess: true
        });

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
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
            return next(new AppError("Payment not completed", 400))
        }
        if (!session) {
            return next(new AppError("Session not found!", 400))
        }
        const orderCode = session.metadata.orderCode;
        const totalAmount = session.metadata.totalAmount;
        const orders = await Order.find({ code: orderCode })

        // Handle concurrency: restore inventory for cancelled orders, and ensure atomicity
        const restoreOps = [];
        for (const order of orders) {
            if (order.status === "cancel") {
                // Find the quantity for this order
                const quantity = order.quantity;
                restoreOps.push({
                    updateOne: {
                        filter: { _id: order.productId },
                        update: { $inc: { inventory: -quantity } }
                    }
                });
            }
        }

        if (restoreOps.length > 0) {
            await Product.bulkWrite(restoreOps);
        }

        if (!orders.length > 0) {
            return next(new AppError("Invalid order code", 400))
        }

        const productIds = orders.map((order) => order.productId)

        const products = await Product.find({ _id: { $in: productIds } }).lean();

        if (products && products.length > 0) {
            // Use bulkWrite for efficient, atomic updates to handle high concurrency
            const merchantOps = [];
            for (const product of products) {
                if (product.merchant && product.price && product.quantity) {
                    merchantOps.push({
                        updateOne: {
                            filter: { _id: product.merchant },
                            update: { $inc: { balance: (totalAmount) } }
                        }
                    });
                }
            }
            if (merchantOps.length > 0) {
                await Seller.bulkWrite(merchantOps);
            }
        }

        if (!Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({ error: "Invalid or empty orders" });
        }

        // Update orders in bulk for performance
        await Order.updateMany(
            { code: orderCode },
            {
                $set: {
                    stripeSessionId: sessionId,
                    isPaid: true,
                    status: "pending",
                    payment: "stripe"
                }
            }
        );
        // Prepare bulk update for product inventory
        // const bulkOps = products.map((product) => ({
        //     updateOne: {
        //         filter: { _id: product.id },
        //         update: { $inc: { inventory: -product.quantity } }
        //     }
        // }));

        // if (bulkOps.length > 0) {
        //     await Product.bulkWrite(bulkOps);
        // }

        // remove orderqueue from redis 

        const email = await getEmailContent({ filename: "orderSuccess.html", data: {} })

        emailQueue.add(
            "email-user",
            {
                receiver: "tuntunmyint10182003@gmail.com",
                subject: "Ayeyar Market Orders Detail",
                html: email,
            },
            { removeOnComplete: true, removeOnFail: 1000 }
        );

        await orderQueue.remove(`order:${orderCode}`);

        // TODO: Add notification to merchant (implement as needed, e.g., queue)

        res.status(200).json({
            status: "success",
            isSuccess: true,
            orderCode,
            totalAmount
        });

    }),
];

