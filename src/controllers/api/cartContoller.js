const { body, validationResult } = require("express-validator");
const Cart = require("../../models/cartModel");
const User = require("../../models/userModel");
const catchAsync = require("../../utils/catchAsync");
const AppError = require("../../utils/appError");
const { Product } = require("../../models/productModel");
const mongoose = require("mongoose")


// Optimized addToCart for high concurrency and scalability
exports.addToCart = [
    body("productId", "Product ID is required").trim().notEmpty().escape(),
    body("quantity", "Quantity is required").trim().notEmpty().escape(),
    body("quantity").isInt({ min: 1 }).withMessage("Quantity must be a positive integer"),

    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }
        const productId = req.body.productId;
        const quantity = parseInt(req.body.quantity, 10);
        if (isNaN(quantity)) {
            return next(new AppError("Quantity must be a valid number", 400));
        }

        // Use lean queries for read-only operations
        const product = await Product.findById(productId).lean();


        if (!product) {
            return next(new AppError("Invalid product ID", 400));
        }

        const user = await User.findById(req.userId).lean();
        if (!user) {
            return next(new AppError("You are not authenticated. Please login", 401));
        }


        const cart = await Cart.findOneAndUpdate(
            { userId: user._id, "products.productId": productId },
            [
                {
                    $set: {
                        products: {
                            $map: {
                                input: "$products",
                                as: "item",
                                in: {
                                    $cond: [
                                        { $eq: ["$$item.productId", product._id] },
                                        {
                                            productId: "$$item.productId",
                                            quantity: { $add: ["$$item.quantity", quantity] }
                                        },
                                        "$$item"
                                    ]
                                }
                            }
                        }
                    }
                }
            ],
            {
                new: true,
                upsert: false
            }
        );

        let updatedCart;
        if (!cart) {
            updatedCart = await Cart.findOneAndUpdate(
                { userId: user._id },
                { $push: { products: { productId, quantity } } },
                { new: true, upsert: true }
            );
        } else {
            updatedCart = cart;
        }

        console.log(updatedCart);


        // Check inventory after update (to avoid race conditions, consider using transactions in production)
        const cartProduct = updatedCart.products.find(
            p => p.productId.toString() === productId.toString()
        );
        if (cartProduct.quantity > product.inventory) {
            // Rollback the update if over-inventory (not fully atomic, use transactions for strict consistency)
            await Cart.updateOne(
                { userId: user._id, "products.productId": productId },
                { $inc: { "products.$.quantity": -quantity } }
            );
            return next(new AppError(`The maximum quantity available for this item is ${product.inventory}`, 400));
        }

        res.status(200).json({
            message: "Product added to cart successfully",
            isSuccess: true
        });
    })
];


exports.getCart = catchAsync(async (req, res, next) => {
    const user = await User.findById(req.userId)
    if (!user) {
        return next(new AppError("Invalid User. Please login.", 400))
    }

    const cart = await Cart.findOne({ userId: user._id }).populate({
        path: 'products.productId',
        select: 'name price images inventory',
        transform: (doc) => {
            if (!doc) return doc;
            const obj = doc.toObject();
            obj.id = obj._id;
            delete obj._id;
            return obj;
        }
    }).select("products.quantity products.productId")



    if (!cart) {
        return next(new AppError("There are no items in this cart", 400))
    }


    res.status(200).json({
        status: "success",
        data: cart,
        isSuccess: true
    });


})


exports.deleteCart = [
    body("type", "Type is required").trim().notEmpty().escape(),
    body("cartId", "Cart ID is required").notEmpty().trim().notEmpty().escape(),
    body("productId", "Product ID is required").if(body("type").equals("product")).trim().notEmpty().escape(),

    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        const { cartId, productId, type } = req.body;

        const user = await User.findById(req.userId);
        if (!user) {
            return next(new AppError("You are not authenticated. Please login.", 401));
        }

        if (!["all", "product"].includes(type)) {
            return next(new AppError("Type should be `all` and `product`", 400));
        }

        let cart = await Cart.findOne({ _id: cartId, userId: user._id });

        if (!cart) {
            return next(new AppError("Cart not found", 404));
        }

        if (!mongoose.Types.ObjectId(productId)) {
            return next(new AppError("Invalid Product Id", 404));
        }

        const product = await Product.findById(productId)

        if (!product) {
            return next(new AppError("Product not found", 404));
        }

        if (type === "all") {
            await Cart.deleteOne({ _id: cartId, userId: user._id });
            return res.status(200).json({ message: "Cart deleted successfully" });
        }

        if (type === "product") {

            const updateResult = await Cart.updateOne(
                { _id: cartId, userId: user._id },
                { $pull: { products: { productId } } }
            );

            if (updateResult.modifiedCount === 0) {
                return next(new AppError("Product not found in cart", 404));
            }

            // Check if cart is now empty and delete if so
            const updatedCart = await Cart.findOne({ _id: cartId, userId: user._id }, { products: 1 });
            if (!updatedCart || updatedCart.products.length === 0) {
                await Cart.deleteOne({ _id: cartId, userId: user._id });
                return res.status(200).json({ message: "Product removed and cart deleted (empty)" });
            }

            return res.status(200).json({ message: "Product removed from cart" });
        }

        return next(new AppError("Invalid type value. Use 'all' or 'product'", 400));
    })
];

exports.updateCart = [
    body("cartId", "Cart ID is required").notEmpty().trim().escape(),
    body("productId", "Product ID is required").notEmpty().trim().escape(),
    body("quantity", "Quantity is required and must be a positive integer")
        .notEmpty()
        .trim()
        .isInt({ min: 1 })
        .withMessage("Quantity must be a positive integer"),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        const { cartId, productId, quantity } = req.body;
        const newQuantity = parseInt(quantity, 10);

        const user = await User.findById(req.userId);
        if (!user) {
            return next(new AppError("You are not authenticated. Please login.", 401));
        }

        const cart = await Cart.findOne({ _id: cartId, userId: user._id });
        if (!cart) {
            return next(new AppError("Cart not found", 404));
        }

        const product = await Product.findById(productId).lean();
        if (!product) {
            return next(new AppError("Invalid product ID", 400));
        }

        const cartProduct = cart.products.find(
            p => p.productId.toString() === productId.toString()
        );
        if (!cartProduct) {
            return next(new AppError("Product not found in cart", 404));
        }

        if (newQuantity > product.inventory) {
            return next(new AppError(`The maximum quantity available for this item is ${product.inventory}`, 400));
        }

        await Cart.updateOne(
            { _id: cartId, userId: user._id, "products.productId": productId },
            { $set: { "products.$.quantity": newQuantity } }
        );

        const updatedCart = await Cart.findOne({ _id: cartId, userId: user._id }, { products: 1 });

        console.log(updatedCart);

        if (!updatedCart || updatedCart.products.length === 0) {
            await Cart.deleteOne({ _id: cartId, userId: user._id });
            return res.status(200).json({ message: "Product removed and cart deleted (empty)" });
        }

        res.status(200).json({ message: "Product quantity updated successfully" });
    })
];
