const { Product } = require("../models/productModel");
const { createOrConnectTag } = require("./tagServices");
exports.createOneProduct = async (productData) => {
    try {
        if (productData.tags && productData.tags.length > 0) {
            productData.tags = await createOrConnectTag(productData.tags)
        }

        return Product.create(productData)

    } catch (error) {
        console.error('Product creation error:', error);
        throw error;
    }
}


exports.updateOneProduct = async (productId, productData) => {
    try {
        if (productData.tags && productData.tags.length > 0) {
            productData.tags = await createOrConnectTag(productData.tags)
        }

        return Product.findByIdAndUpdate(productId, productData)

    } catch (error) {
        console.error('Product update error:', error);
        throw error;
    }
}

