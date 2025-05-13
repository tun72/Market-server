const sharp = require("sharp");
const { Product } = require("../models/productModel");
const catchAsync = require("../utils/catchAsync");
const upload = require("../utils/upload");
const factory = require("./handlerFactory")



exports.uploadProductImages = upload.fields(
    [
        { name: "image", maxCount: 1 },
        { name: "images", maxCount: 4 }
    ]
)

exports.resizeProductImages = catchAsync(async (req, res, next) => {
    if (!req.files.image || !req.files.images) return next();

    req.body.image = `product-${Date.now()}-${Math.round(Math.random() * 1e9)}-cover.jpeg`

    await sharp(req.files.image[0].buffer).resize(2000, 1333).toFormat("jpeg").jpeg({ quality: 90 }).toFile(`public/img/products/${req.body.image}`)

    req.body.images = [];

    await Promise.all(req.files.images.map(async (file, i) => {
        const fileName = `product-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpeg`

        await sharp(file.buffer).resize(2000, 1333).toFormat("jpeg").jpeg({ quality: 90 }).toFile(`public/img/products/${fileName}`)

        req.body.images.push(fileName)
    }))
    next()
})

exports.getAllProducts = factory.getAll({
    Model: Product,
});

exports.getProductById = factory.getOne({
    Model: Product,
});

exports.createProduct = factory.createOne(Product)
exports.deleteProduct = factory.deleteOne(Product)
exports.updateProduct = factory.updateOne(Product)