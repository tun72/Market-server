const AppError = require("../../utils/appError");
const catchAsync = require("../../utils/catchAsync");
const { body, validationResult, param } = require("express-validator");
const { checkPhotoIfNotExistArray } = require("../../utils/check");
const { createOneProduct, updateOneProduct, generateProducts } = require("../../services/productServices");
const ImageQueue = require("../../jobs/queues/ImageQueue");


const { createOrConnectCategory } = require("../../services/categoryService");
const { getTypeByName } = require("../../services/typeService");
const { Product, Category } = require("../../models/productModel");
const mongoose = require("mongoose")
const factory = require("../handlerFactory");
const { removeImages } = require("../../utils/fileDelete");
const Seller = require("../../models/sellerModel");
const sanitizeHtml = require("sanitize-html");

const { decode } = require('html-entities');



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
        fields: ["brand", "category", "tags", "merchant", "type"],
    })
]

exports.getProductById = [
    param("id")
        .notEmpty()
        .withMessage("Product ID is required")
        .isMongoId()
        .withMessage("Invalid product ID format"),
    catchAsync(async (req, res, next) => {
        const { id } = req.params;
        const { userId, user } = req;
        if (!user) {
            return next(new AppError("Authentication required", 401));
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return next(new AppError("Invalid product ID format", 400));
        }
        const seller = await Seller.findById(userId).lean().select('_id');
        if (!seller) {
            return next(new AppError("Seller account not found", 404));
        }
        const product = await Product.findOne({
            _id: id,
            merchant: seller._id
        }).lean().select('_id merchant');
        if (!product) {
            return next(new AppError("Product not found or access denied", 404));
        }
        req.seller = seller;
        next();
    }), factory.getOne({
        Model: Product,
        fields: ["brand", "category", "tags", "merchant", "type"],
    })
]


exports.createProduct = [
    body("name", "Name is required.").trim("").notEmpty().escape(),
    body("body", "body is required.").trim("").notEmpty().escape().customSanitizer((value) => {

        return sanitizeHtml(value)

    }),
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

        body = decode(body)



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
        res.status(200).json({ message: "Product successfully created", isSuccess: true })

    })
]

exports.deleteImage = [
    body("productId", "Product Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),
    body("index", "Image Index is required").isInt({ min: 0 }),
    body("image_url", "Image url is required").notEmpty(),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }
        let { productId, index, image_url } = req.body;
        index = parseInt(index);
        const product = await Product.findById(productId);

        if (!product) {
            return next(new AppError("No product found with that Id.", 404));
        }
        const originalFiles = product.images;
        if (index < 0 || index >= originalFiles.length) {
            return next(new AppError("Invalid image index.", 400));
        }
        if (originalFiles[index] !== image_url) {
            return next(new AppError("Image URL does not match the specified index.", 400));
        }

        const updatedImages = originalFiles.filter((image, i) => i !== index)

        const originalFile = [image_url]
        const optimizeFile = [image_url.split(".")[0] + ".webp"]

        await removeImages(originalFile, optimizeFile);
        await Product.findByIdAndUpdate(
            productId,
            { images: updatedImages },
            { new: true, runValidators: true }
        );
        res.status(200).json({
            message: "Image successfully deleted.",
            remainingImages: updatedImages.length,
            isSuccess: true
        });
    })
];

// // [{type: "kept", "key": "1753515383413-7734021.jpeg", index:0}, {"type": "new", "index": 1}]
// exports.updateProduct = [
//     body("productId", "Product Id is required.").custom((id) => {
//         return mongoose.Types.ObjectId.isValid(id);
//     }),
//     body("name", "Name is required.").trim("").notEmpty().escape(),
//     body("body", "body is required.").trim("").notEmpty().escape(),
//     body("description", "Description is required.").trim("").notEmpty().escape(),
//     body("price", "Price is required.")
//         .isFloat({ min: 0.1 })
//         .isDecimal({ decimal_digits: "1,2" }),
//     body("inventory", "Inventory is required").isInt({ min: 1 }),
//     body("category", "Category is required").trim("").notEmpty().escape(),
//     body("type", "Type is required.").trim("").notEmpty().escape(),
//     body("tags", "Tag is invalid")
//         .optional({ nullable: true })
//         .customSanitizer((value) => {
//             if (value) {
//                 return value
//                     .split(",")
//                     .map((tag) => tag.trim())
//                     .filter((tag) => tag !== "");
//             }
//             return []
//         }),
//     body("colors", "Color is invalid")
//         .optional({ nullable: true })
//         .customSanitizer((value) => {
//             if (value) {
//                 return value
//                     .split(",")
//                     .map((col) => col.trim())
//                     .filter((col) => col !== "");
//             }
//         })

//     , body("sizes", "Size is invalid")
//         .optional({ nullable: true })
//         .customSanitizer((value) => {
//             if (value) {
//                 return value
//                     .split(",")
//                     .map((size) => size.trim())
//                     .filter((size) => size !== "");
//             }
//         }),
//     body("brand", "Brand is invalid.").trim().optional({ nullable: true }),
//     body("shipping", "Shipping is invalid").isInt({ gt: 0 }).optional(),


//     catchAsync(async (req, res, next) => {

//         const errors = validationResult(req).array({ onlyFirstError: true });
//         if (errors.length) {
//             if (req.files && req.files.length > 0) {
//                 const originalFiles = req.files.map((file) => file.filename)
//                 removeImages(originalFiles)
//             }


//             return next(new AppError(errors[0].msg, 400));
//         }

//         let { productId, name, body, description, price, discount, shipping, type, category, tags, colors, sizes, brand, inventory } = req.body;

//         const product = await Product.findById(productId)

//         if (!product) {
//             return next(new AppError("No product found with that Id.", 404))
//         }

//         // check with merchant ID owner or not

//         type = await getTypeByName(type);

//         if (!type) {
//             return next(new AppError("Your product type is not supported", 400))
//         }

//         category = await createOrConnectCategory(category, type._id)
//         const data = {
//             name,
//             description,
//             body,
//             price,
//             discount,
//             type: type._id.toString(),
//             category: category._id.toString(),
//             tags,
//             colors,
//             sizes,
//             brand,
//             inventory,
//             shipping,
//         }

//         if (req.files && req.files.length > 0) {
//             const originalFiles = product.images;
//             const optimizeFiles = originalFiles.map((file) => file.split(".")[0] + ".webp")
//             await removeImages(originalFiles, optimizeFiles);

//             data.images = req.files.map((file) => file.filename)

//             await Promise.all(req.files.map(async (file) => {
//                 const splitName = file.filename.split(".")[0] + ".webp"
//                 await ImageQueue.add("optimize-image", {
//                     filePath: file.path,
//                     fileName: splitName,
//                     width: 835,
//                     height: 577,
//                     quality: 100,
//                 }, {
//                     attempts: 3,
//                     backoff: {
//                         type: "exponential",
//                         delay: 1000,
//                     },
//                 })
//             }))
//         }
//         const updatedProduct = await updateOneProduct(product._id, data)

//         res.status(200).json({ message: "Product successfully updated", productId: updatedProduct._id })

//     })
// ]

exports.updateProduct = [
    body("productId", "Product Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),
    body("name", "Name is required.").trim("").notEmpty().escape(),
    body("body", "body is required.").trim("").notEmpty().escape().customSanitizer((value) => {
        return sanitizeHtml(value)
    }),
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
        }),
    body("sizes", "Size is invalid")
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
    body("isFeatured").optional(),
    body("update_images", "Update images format is invalid")
        .optional({ nullable: true })
        .customSanitizer((value) => {
            if (!value) {
                return null
            }
            if (typeof value === 'string') {
                try {
                    return JSON.parse(value);
                } catch (e) {
                    return null;
                }
            }
            return value;
        })
        .custom((value) => {


            if (!value) return true;

            if (!Array.isArray(value)) {
                throw new Error("Update images must be an array");
            }

            for (let i = 0; i < value.length; i++) {
                const item = value[i];
                if (!item || typeof item !== 'object') {
                    throw new Error("Each update image item must be an object");
                }

                if (!item.hasOwnProperty('type') || !item.hasOwnProperty('index')) {
                    throw new Error("Each update image item must have 'type' and 'index' properties");
                }

                if (!['kept', 'new'].includes(item.type)) {
                    throw new Error("Update image type must be either 'kept' or 'new'");
                }

                if (!Number.isInteger(item.index) || item.index < 0) {
                    throw new Error("Update image index must be a non-negative integer");
                }

                if (item.type === 'kept' && !item.key) {
                    throw new Error("Kept images must have a 'key' property");
                }
            }




            // Check for duplicate indices
            const indices = value.map(item => item.index);
            const uniqueIndices = [...new Set(indices)];
            if (indices.length !== uniqueIndices.length) {
                throw new Error("Duplicate indices found in update_images");
            }

            return true;
        }),

    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            if (req.files && req.files.length > 0) {
                const originalFiles = req.files.map((file) => file.filename)
                removeImages(originalFiles)
            }
            return next(new AppError(errors[0].msg, 400));
        }

        let { productId, name, body, description, isFeatured, price, discount, shipping, type, category, tags, colors, sizes, brand, inventory, update_images } = req.body;

        body = decode(body)
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
            isFeatured,
        }

        // Handle image updates
        if (update_images && Array.isArray(update_images)) {
            // Sort update_images by index to maintain order
            const sortedUpdateImages = update_images.sort((a, b) => a.index - b.index);

            // Validate that we have enough new files for 'new' type images
            const newImageCount = sortedUpdateImages.filter(item => item.type === 'new').length;
            const uploadedFileCount = req.files ? req.files.length : 0;

            if (newImageCount > uploadedFileCount) {
                if (req.files && req.files.length > 0) {
                    const originalFiles = req.files.map((file) => file.filename)
                    removeImages(originalFiles)
                }
                return next(new AppError(`Expected ${newImageCount} new images but received ${uploadedFileCount}`, 400));
            }

            // Build the final images array based on update_images order
            const finalImages = [];
            let newFileIndex = 0;
            const imagesToRemove = [];
            const optimizedImagesToRemove = [];

            // Collect all existing images that are not being kept
            const keptImageKeys = sortedUpdateImages
                .filter(item => item.type === 'kept')
                .map(item => item.key);

            // Mark images for removal (those not in kept list)
            product.images.forEach(imageKey => {
                if (!keptImageKeys.includes(imageKey)) {
                    imagesToRemove.push(imageKey);
                    const optimizedName = imageKey.split(".")[0] + ".webp";
                    optimizedImagesToRemove.push(optimizedName);
                }
            });

            // Process each update image item in order
            for (const updateItem of sortedUpdateImages) {
                if (updateItem.type === 'kept') {
                    // Verify the key exists in current product images
                    if (!product.images.includes(updateItem.key)) {
                        if (req.files && req.files.length > 0) {
                            const originalFiles = req.files.map((file) => file.filename)
                            removeImages(originalFiles)
                        }
                        return next(new AppError(`Image key '${updateItem.key}' not found in current product images`, 400));
                    }
                    finalImages[updateItem.index] = updateItem.key;
                } else if (updateItem.type === 'new') {
                    if (newFileIndex >= uploadedFileCount) {
                        if (req.files && req.files.length > 0) {
                            const originalFiles = req.files.map((file) => file.filename)
                            removeImages(originalFiles)
                        }
                        return next(new AppError("Not enough new image files provided", 400));
                    }
                    finalImages[updateItem.index] = req.files[newFileIndex].filename;
                    newFileIndex++;
                }
            }

            // Remove gaps in array (in case indices weren't continuous)
            data.images = finalImages.filter(img => img !== undefined);

            // Remove old images that are no longer needed
            if (imagesToRemove.length > 0) {
                await removeImages(imagesToRemove, optimizedImagesToRemove);
            }

            // Process new image optimization
            if (req.files && req.files.length > 0) {
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
        } else {
            // Legacy behavior - replace all images if files are provided
            if (req.files && req.files.length > 0) {
                const originalFiles = product.images


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
        }

        await updateOneProduct(product._id, data)

        res.status(200).json({ message: "Product successfully updated", isSuccess: true })
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

        res.status(200).json({ message: "Product successfully deleted.", isSuccess: true })

    })
]

// category
exports.getAllCategories = factory.getAll({
    Model: Category
})

exports.PreInsertedProducts = catchAsync(async (req, res, next) => {
    const userId = req.userId;
    const merchant = await Seller.findById(userId)

    if (!merchant) {
        return next(new AppError("You'r not merchant.", 400))
    }

    const products = await Product.find({ merchant: merchant._id }).limit(3).populate("category type tags")



    if (products.length < 3) {
        return next(new AppError("Required minimum to make AI Suggesstion", 400))
    }

    const preInsProducts = await generateProducts({ products })

    return res.status(200).json({
        "message": "success",
        products: JSON.parse(preInsProducts),
        isSuccess: true
    })

})

