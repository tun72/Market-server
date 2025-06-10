

const Seller = require("../../models/sellerModel");
const factory = require("../handlerFactory");

// products
exports.getAllMerchants = factory.getAll({
    Model: Seller,
    fields: ["products"],
})

exports.getMerchantById = factory.getOne({
    Model: Seller,
    // fields: ["brand", "category", "tags", "merchant", "type"]

})
