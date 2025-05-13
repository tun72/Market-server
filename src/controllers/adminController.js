const { Withdrawal } = require("../models/paymentCategoryModel");
const { Product } = require("../models/productModel");

const factory = require("./handlerFactory");
const catchAsync = require("../utils/catchAsync");
const { getSocket, userSocketMap } = require("../socket");
const { Event } = require("../models/eventsModel");
const { Seller } = require("../models/userModel");


// Seller
exports.getAllSellers = factory.getAll({
    Model: Seller,
});

exports.getSellerById = factory.getOne({
    Model: Seller
})

exports.createSeller = factory.createOne(Seller)

exports.updateSeller = factory.updateOne(Seller)
exports.deleteSeller = factory.deleteOne(Seller)


// withdraw
exports.getAllWithDraw = factory.getAll({
    Model: Withdrawal
})


// products
exports.getAllProducts = factory.getAll({
    Model: Product,
    fields: ["brand", "category", "variations", "seller"]
})

exports.getProductById = factory.getOne({
    Model: Product,
    fields: ["brand", "category", "variations", "seller"]

})

exports.updateProduct = factory.updateOne(Product)
exports.removeProduct = factory.deleteOne(Product)



exports.updateStatus = catchAsync(async (req, res, next) => {
    // 1) create notification

    // 2) push notification

    const io = getSocket();


    io.to(userSocketMap.get("123")).emit('product-status-changed', {
        status: 'active',
        message: "Your Product is now in active state.",
        productId: "123456789"
    });

    // 3) Send Email to seller

    await Product.findByIdAndUpdate(req.params.id, req.body, {
        runValidators: true
    })

    return res.status(200).json({ message: "sucess" })
})


// events
exports.createEvent = factory.createOne(Event)
exports.getAllEvents = factory.getAll({ Model: Event })
exports.updateEvent = factory.updateOne(Event)
exports.deleteEvent = factory.deleteOne(Event)




