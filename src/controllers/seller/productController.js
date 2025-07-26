const AppError = require("../../utils/appError");
const catchAsync = require("../../utils/catchAsync");
const { body, validationResult } = require("express-validator");
const { checkPhotoIfNotExistArray } = require("../../utils/check");
const { createOneProduct, updateOneProduct } = require("../../services/productServices");
const ImageQueue = require("../../jobs/queues/ImageQueue");


const { createOrConnectCategory } = require("../../services/categoryService");
const { getTypeByName } = require("../../services/typeService");
const { Product } = require("../../models/productModel");
const mongoose = require("mongoose")
const factory = require("../handlerFactory");
const { removeImages } = require("../../utils/fileDelete");
const Seller = require("../../models/sellerModel");



exports.getAllProducts = [
    catchAsync(async (req, res, next) => {
        if (!req.user) {
            return next(new AppError("Login required", 403))
        }
        const seller = await Seller.findById(req.userId)
        if (!seller) {
            next(new AppError("Access denied", 403))
        }
        req.query.merchant = seller._id
        next()
    }), factory.getAll({
        Model: Product,
    })
]

exports.getProductById = [
    catchAsync(async (req, res, next) => {

        // if (!req.user) {
        //     return next(new AppError("Login required", 403))
        // }
        // const seller = await Seller.findById(req.userId)
        // if (!seller) {
        //     next(new AppError("Access denied", 403))
        // }
        // req.query.merchant = seller._id
        // req.query.
        // if (!req.user) {
        //     return next(new AppError("Login required", 403))
        // }
        // req.query.merchant = "6828bc48f26e66121cf78eb3"

        // need to check merchant really own the product
        next()
    }), factory.getOne({
        Model: Product,
    })
]


exports.createProduct = [
    body("name", "Name is required.").trim("").notEmpty().escape(),
    body("body", "body is required.").trim("").notEmpty().escape(),
    body("description", "Description is required.").trim("").notEmpty().escape(),
    body("price", "Price is required.")
        .isFloat({ min: 0.1 })
        .isDecimal({ decimal_digits: "1,2" }),
    body("inventory", "Inventory is required").isInt({ min: 1 }),
    body("category", "Category is required").trim("").notEmpty().escape(),
    body("type", "Type is required.").trim("").notEmpty().escape(),
    body("tags", "Tag is invalid")
        .optional({ nullable: true })
        .customSanitizer((value) => {
            if (value) {
                return value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter((tag) => tag !== "");
            }
        }),
    body("colors", "Color is invalid")
        .optional({ nullable: true })
        .customSanitizer((value) => {
            if (value) {
                return value
                    .split(",")
                    .map((col) => col.trim())
                    .filter((col) => col !== "");
            }
        })

    , body("sizes", "Size is invalid")
        .optional({ nullable: true })
        .customSanitizer((value) => {
            if (value) {
                return value
                    .split(",")
                    .map((size) => size.trim())
                    .filter((size) => size !== "");
            }
        }),
    body("brand", "Brand is invalid.").trim().optional({ nullable: true }),
    body("shipping", "Shipping is invalid").isInt({ gt: 0 }).optional(),

    catchAsync(async (req, res, next) => {

        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {

            if (req.files && req.files.length > 0) {
                const originalFiles = req.files.map((file) => file.filename)
                removeImages(originalFiles)
            }


            return next(new AppError(errors[0].msg, 400));
        }

        let { name, body, description, price, discount, shipping, type, category, tags, colors, sizes, brand, inventory } = req.body;
        checkPhotoIfNotExistArray(req.files)

        // need to create aws s3 
        // image optimize
        await Promise.all(req.files.map(async (file) => {
            const splitName = file.filename.split(".")[0] + ".webp"
            await ImageQueue.add("optimize-image", {
                filePath: file.path,
                fileName: splitName,
                width: 835,
                height: 577,
                quality: 100,
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
            })
        }))

        const images = req.files.map((file) => file.filename)

        type = await getTypeByName(type);
        if (!type) {
            return next(new AppError("Your product type is not supported", 400))
        }

        category = await createOrConnectCategory(category, type._id)

        const data = {
            name,
            description,
            body,
            price,
            discount,
            type: type._id.toString(),
            category: category._id.toString(),
            tags,
            colors,
            sizes,
            brand,
            inventory,
            shipping,
            images,
            merchant: req.userId // , 6828bc48f26e66121cf78eb4
        }

        const product = await createOneProduct(data)
        res.status(200).json({ message: "Product successfully created", productId: product._id })

    })
]

exports.updateProduct = [
    body("productId", "Product Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),
    body("name", "Name is required.").trim("").notEmpty().escape(),
    body("body", "body is required.").trim("").notEmpty().escape(),
    body("description", "Description is required.").trim("").notEmpty().escape(),
    body("price", "Price is required.")
        .isFloat({ min: 0.1 })
        .isDecimal({ decimal_digits: "1,2" }),
    body("inventory", "Inventory is required").isInt({ min: 1 }),
    body("category", "Category is required").trim("").notEmpty().escape(),
    body("type", "Type is required.").trim("").notEmpty().escape(),
    body("tags", "Tag is invalid")
        .optional({ nullable: true })
        .customSanitizer((value) => {
            if (value) {
                return value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter((tag) => tag !== "");
            }
            return []
        }),
    body("colors", "Color is invalid")
        .optional({ nullable: true })
        .customSanitizer((value) => {
            if (value) {
                return value
                    .split(",")
                    .map((col) => col.trim())
                    .filter((col) => col !== "");
            }
        })

    , body("sizes", "Size is invalid")
        .optional({ nullable: true })
        .customSanitizer((value) => {
            if (value) {
                return value
                    .split(",")
                    .map((size) => size.trim())
                    .filter((size) => size !== "");
            }
        }),
    body("brand", "Brand is invalid.").trim().optional({ nullable: true }),
    body("shipping", "Shipping is invalid").isInt({ gt: 0 }).optional(),

    catchAsync(async (req, res, next) => {

        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            if (req.files && req.files.length > 0) {
                const originalFiles = req.files.map((file) => file.filename)
                removeImages(originalFiles)
            }


            return next(new AppError(errors[0].msg, 400));
        }

        let { productId, name, body, description, price, discount, shipping, type, category, tags, colors, sizes, brand, inventory } = req.body;

        const product = await Product.findById(productId)

        if (!product) {
            return next(new AppError("No product found with that Id.", 404))
        }

        // check with merchant ID owner or not

        type = await getTypeByName(type);

        if (!type) {
            return next(new AppError("Your product type is not supported", 400))
        }

        category = await createOrConnectCategory(category, type._id)
        const data = {
            name,
            description,
            body,
            price,
            discount,
            type: type._id.toString(),
            category: category._id.toString(),
            tags,
            colors,
            sizes,
            brand,
            inventory,
            shipping,
        }

        if (req.files && req.files.length > 0) {
            const originalFiles = product.images;
            const optimizeFiles = originalFiles.map((file) => file.split(".")[0] + ".webp")
            await removeImages(originalFiles, optimizeFiles);

            data.images = req.files.map((file) => file.filename)

            await Promise.all(req.files.map(async (file) => {
                const splitName = file.filename.split(".")[0] + ".webp"
                await ImageQueue.add("optimize-image", {
                    filePath: file.path,
                    fileName: splitName,
                    width: 835,
                    height: 577,
                    quality: 100,
                }, {
                    attempts: 3,
                    backoff: {
                        type: "exponential",
                        delay: 1000,
                    },
                })
            }))
        }
        const updatedProduct = await updateOneProduct(product._id, data)

        res.status(200).json({ message: "Product successfully updated", productId: updatedProduct._id })

    })
]

exports.deleteProduct = [
    body("productId", "Product Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),

    catchAsync(async (req, res, next) => {

        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        let { productId } = req.body;

        const product = await Product.findById(productId)

        if (!product) {
            return next(new AppError("No product found with that Id.", 404))
        }

        const originalFiles = product.images;
        const optimizeFiles = originalFiles.map((file) => file.split(".")[0] + ".webp")
        await removeImages(originalFiles, optimizeFiles);

        await Product.findByIdAndDelete(product._id)

        res.status(200).json({ message: "Product successfully deleted." })

    })
]


