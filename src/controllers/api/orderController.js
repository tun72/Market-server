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
const mongoose = require("mongoose")
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

        total += (amount + shippingFee) * products[index].quantity;;
        // totalDiscount += discount;
    });

    return { total: total / 100 };
};

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

        const products = productsString.split("#").map(id => {
            const [quantity, productId] = id.split("_");
            return { id: productId, quantity: Number(quantity) };
        });

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
            return next(new AppError("Invalid order code", 400))
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
            success_url: `http://localhost:3000/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `http://localhost:3000/purchase-cancel`,
            // discounts: coupon
            //     ? [
            //         {
            //             coupon: await createStripeCoupon(coupon.discountPercentage),
            //         },
            //     ]
            //     : [],
            metadata: {
                userId: req.user._id.toString(),
                orderCode: code,
                products: JSON.stringify(
                    products.map((p, i) => ({
                        id: p._id,
                        merchant: p.merchant,
                        quantity: orders[i].quantity,
                        price: p.price,
                        shipping: p.shipping,
                    }))
                ),
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

        const products = JSON.parse(session.metadata.products);
        const orderCode = session.metadata.orderCode;
        const totalAmount = session.metadata.totalAmount;



        const orders = await Order.find({ code: orderCode })

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
                    status: "accept",
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

        // if (bulkOps.length > 0) {
        //     await Product.bulkWrite(bulkOps);
        // }

        // remove orderqueue from redis 
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

