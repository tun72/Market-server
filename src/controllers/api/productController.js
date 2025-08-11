const { Product, Type } = require("../../models/productModel");

const factory = require("../handlerFactory");
const catchAsync = require("../../utils/catchAsync");
const { Category } = require("../../models/productModel");
const { Event } = require("../../models/eventsModel");
const AppError = require("../../utils/appError");
const mongoose = require("mongoose")

// products
exports.getAllProducts = factory.getAll({
    Model: Product,
    fields: ["brand", "category", "tags", "merchant", "type"],
})

// exports. = factory.getOne({
//     Model: Product,
//     fields: ["brand", "category", "tags", "merchant", "type"]

// })

exports.getProductById = catchAsync(async (req, res, next) => {
    const productId = req.params.id;
    if (!productId) {
        return next(new AppError("Type Id is required.", 400));
    }

    if (!mongoose.isValidObjectId(productId)) {
        return next(new AppError("Is not valid ID", 404));
    }
    const products = await Product.aggregate([
        // Match main product
        { $match: { _id: new mongoose.Types.ObjectId(productId) } },

        {
            $lookup: {
                from: "tags",
                localField: "tags",
                foreignField: "_id",
                as: "tags"
            }
        },

        // Populate category
        {
            $lookup: {
                from: "categories",
                localField: "category",
                foreignField: "_id",
                as: "category"
            }
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },

        // Populate type
        {
            $lookup: {
                from: "types",
                localField: "type",
                foreignField: "_id",
                as: "type"
            }
        },
        { $unwind: { path: "$type", preserveNullAndEmptyArrays: true } },


        // Populate merchant
        {
            $lookup: {
                from: "users",
                localField: "merchant",
                foreignField: "_id",
                as: "merchant"
            }
        },
        { $unwind: { path: "$merchant", preserveNullAndEmptyArrays: true } },

        {
            $addFields: {
                "merchant.address.fulladdress": {
                    $cond: {
                        if: { $and: ["$merchant", "$merchant.address"] },
                        then: {
                            $concat: [
                                { $ifNull: ["$merchant.address.street", ""] },
                                ", ",
                                { $ifNull: ["$merchant.address.city", ""] },
                                ", ",
                                { $ifNull: ["$merchant.address.state", ""] },
                                ", ",
                                { $ifNull: ["$merchant.address.country", ""] },

                            ]
                        },
                        else: null
                    }
                },
                "merchant.id": "$_id"
            }
        },


        // Get related products 
        {
            $lookup: {
                from: "products",
                let: {
                    categoryId: "$category._id",
                    currentId: "$_id"
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$category", "$$categoryId"] },
                                    { $ne: ["$_id", "$$currentId"] }
                                ]
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: "tags",
                            localField: "tags",
                            foreignField: "_id",
                            as: "tags"
                        }
                    },
                    {
                        $lookup: {
                            from: "categories",
                            localField: "category",
                            foreignField: "_id",
                            as: "category"
                        }
                    },
                    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },

                    // Populate type
                    {
                        $lookup: {
                            from: "types",
                            localField: "type",
                            foreignField: "_id",
                            as: "type"
                        }
                    },
                    { $unwind: { path: "$type", preserveNullAndEmptyArrays: true } },

                    // Populate merchant
                    {
                        $lookup: {
                            from: "users",
                            localField: "merchant",
                            foreignField: "_id",
                            as: "merchant"
                        }
                    },
                    { $unwind: { path: "$merchant", preserveNullAndEmptyArrays: true } },
                    { $limit: 5 },
                    {
                        $addFields: {
                            "merchant.address.fulladdress": {
                                $cond: {
                                    if: { $and: ["$merchant", "$merchant.address"] },
                                    then: {
                                        $concat: [
                                            { $ifNull: ["$merchant.address.street", ""] },
                                            ", ",
                                            { $ifNull: ["$merchant.address.city", ""] },
                                            ", ",
                                            { $ifNull: ["$merchant.address.state", ""] },
                                            ", ",
                                            { $ifNull: ["$merchant.address.country", ""] },

                                        ]
                                    },
                                    else: null
                                }
                            },
                            "merchant.id": "$_id"
                        }
                    },
                    {
                        $project: {
                            __v: 0,
                            _id: 0,
                            merchant: {
                                _id: 0,
                                "password": 0,
                                "randToken": 0,
                                "NRCNumber": 0,
                                "NRCFront": 0,
                                "NRCBack": 0,
                                "balance": 0,
                                "__v": 0,
                                "createdAt": 0,
                                "updatedAt": 0,
                                role: 0
                            }
                        }
                    }  // Exclude unnecessary fields
                ],
                as: "relatedProducts"
            }
        },
        {
            $project: {
                __v: 0,
                _id: 0,
                merchant: {
                    _id: 0,
                    "password": 0,
                    "randToken": 0,
                    "NRCNumber": 0,
                    "NRCFront": 0,
                    "NRCBack": 0,
                    "balance": 0,
                    "__v": 0,
                    "createdAt": 0,
                    "updatedAt": 0,
                    role: 0
                }
            }
        },


        // Convert to single document
        { $limit: 1 }
    ]);


    if (!products.length) {
        return next(new AppError("Product Not found with that Id", 404));
    }
    res.status(200).json({ message: "success", product: products[0] })
})


exports.updateProduct = factory.updateOne(Product)
exports.removeProduct = factory.deleteOne(Product)


exports.getFeaturedProducts = catchAsync(async (req, res, next) => {

    // need to make this with aggregation and random limit 7
    const products = await Product.aggregate([
        { $match: { isFeatured: true } },
        { $sample: { size: 10 } },
        { $addFields: { id: "$_id" } },
        {
            $lookup: {
                from: "users",           // collection to join
                localField: "merchant",    // field in Post
                foreignField: "_id",     // field in User
                as: "merchant"      // output array field
            },

        },
        {
            $unwind: {
                path: "$merchant",
                preserveNullAndEmptyArrays: true // Optional: if some products have no merchant
            }
        },
        {
            $addFields: {
                optimize_images: "$images",
            }
        },
        {
            $project: {
                __v: 0,
                _id: 0,
                merchant: {
                    _id: 0,
                    "password": 0,
                    "randToken": 0,
                    "phone": 0,
                    "address": 0,
                    "description": 0,
                    "NRCNumber": 0,
                    "NRCFront": 0,
                    "NRCBack": 0,
                    "balance": 0,
                    "rating": 0,
                    "__v": 0,
                    "createdAt": 0,
                    "updatedAt": 0,
                    role: 0
                }
            }
        }
    ])

    // console.log(products);

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
        { $match: { _id: productId } },
    ])
    res.status(200).json({ message: "success", products })
})

// top types 
exports.getPopularTypes = catchAsync(async (req, res, next) => {
    const types = await Type.aggregate([
        { $sample: { size: 7 } },
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
