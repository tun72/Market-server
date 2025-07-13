
const { body } = require("express-validator");
const { Product, Type } = require("../../models/productModel");

const factory = require("../handlerFactory");
const catchAsync = require("../../utils/catchAsync");
const { Category } = require("../../models/productModel");
const { Event } = require("../../models/eventsModel");
const AppError = require("../../utils/appError");

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


exports.getFeaturedProducts = catchAsync(async (req, res, next) => {

    // need to make this with aggregation and random limit 7
    const products = await Product.aggregate([
        { $match: { isFeatured: true } },
        { $sample: { size: 5 } },
        { $addFields: { id: "$_id" } },
        { $project: { _id: 0, __v: 0 } }

    ])

    return res.status(200).json({ message: "sucess", products })
})

exports.searchQueryProducts = catchAsync(async (req, res, next) => {
    const { q } = req.query

    if (q.length < 3) {
        return next(new AppError("Search query must at least 3 words", 400))
    }

    const product = await Product.aggregate([
        { $match: { name: { $regex: '.*' + q + '.*', $options: 'i' } } },
        {
            $group: {
                _id: "$name",
            }
        },
        {
            $project: { _id: 0, name: "$_id" }
        }
    ])

    return res.status(200).json({ message: "Success", isSuccess: true, product })
})

exports.getRelatedProduct = catchAsync(async (req, res, next) => {

    const { productId } = req.params;

    if (!productId) {
        return next(new AppError("Type Id is required.", 400));
    }

    const products = await Product.aggregate([
        // { $match: { type: typeId } },
        { $sample: { size: 5 } },
        { $addFields: { id: "$_id" } },
        { $project: { _id: 0, __v: 0 } }
    ])
    res.status(200).json({ message: "success", products })
})

// top types 
exports.getPopularTypes = catchAsync(async (req, res, next) => {
    const types = await Type.aggregate([
        { $sample: { size: 9 } },
    ])
    return res.status(200).json({ message: "Success", isSuccess: true, types })
});

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

exports.getAllCategories = factory.getAll({
    Model: Category
})


// events
exports.getAllEvents = catchAsync(async (req, res, next) => {
    const events = await Event.find().select("name type discount poster status")
    const filterEvents = events.filter((event) => event.status === "upcoming")
    return res.status(200).json({ message: "sucess", filterEvents })
})
