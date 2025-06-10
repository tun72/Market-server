
const { body } = require("express-validator");
const { Product, Type } = require("../../models/productModel");

const factory = require("../handlerFactory");
const catchAsync = require("../../utils/catchAsync");
const { Category } = require("../../models/productModel");

// products
exports.getAllProducts = factory.getAll({
    Model: Product,
    fields: ["brand", "category", "tags", "merchant", "type"],
})

exports.getProductById = factory.getOne({
    Model: Product,
    fields: ["brand", "category", "tags", "merchant", "type"]

})

exports.updateProduct = factory.updateOne(Product)
exports.removeProduct = factory.deleteOne(Product)


// types

exports.getAllTypes = factory.getAll({
    Model: Type
})
exports.getCategories = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ message: "Type Id is required." });
    }
    const categories = await Category.find({ type: id });
    res.status(200).json({
        status: "success",
        results: categories.length,
        data: categories
    });
});