
const { Product } = require("../../models/productModel");

const factory = require("../handlerFactory");



// products
exports.getAllProducts = factory.getAll({
    Model: Product,
    fields: ["brand", "category", "tags", "merchant", "type"],
})

exports.getProductById = factory.getOne({
    Model: Product,
    fields: ["brand", "category", "variations", "seller"]

})

exports.updateProduct = factory.updateOne(Product)
exports.removeProduct = factory.deleteOne(Product)
