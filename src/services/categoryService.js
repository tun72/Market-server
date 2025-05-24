const { Category } = require("../models/productModel")

exports.getCategoryByName = async (category) => {
    return Category.findOne({ name: category })
}

exports.createOrConnectCategory = async (category, typeId) => {
    return Category.findOneAndUpdate(
        { name: category, type: typeId },
        { $setOnInsert: { name: category, type: typeId } },
        {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true
        }
    )
}