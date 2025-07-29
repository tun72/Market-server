

const Seller = require("../../models/sellerModel");
const catchAsync = require("../../utils/catchAsync");
const factory = require("../handlerFactory");

// products
exports.getAllMerchants = factory.getAll({
    Model: Seller,
    // fields: ["products"],
})

exports.getMerchantById = factory.getOne({
    Model: Seller,
    // fields: ["brand", "category", "tags", "merchant", "type"]
})


exports.getReliableMerchants = catchAsync(async (req, res, next) => {
    const merchants = await Seller.aggregate([
        { $sample: { size: 6 } }
    ])
    return res.status(200, { message: "success", isSuccess: true, merchants })
})
