const { ProductTag } = require("../models/productModel");

exports.createOrConnectTag = async (tags) => {
    const tagIds = await Promise.all([...new Set(tags)].map(name =>
        ProductTag.findOneAndUpdate(
            { name },
            { $setOnInsert: { name } },
            {
                upsert: true,
                new: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        )
    ));

    // console.log(tagIds);

    return tagIds.map(tag => tag._id.toString());
}