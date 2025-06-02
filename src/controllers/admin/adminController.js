const { Withdrawal } = require("../../models/paymentCategoryModel");
const { Product } = require("../../models/productModel");

const factory = require("../handlerFactory");
const catchAsync = require("../../utils/catchAsync");
const { getSocket, userSocketMap } = require("../../socket");
const { Event } = require("../../models/eventsModel");




// withdraw
exports.getAllWithDraw = factory.getAll({
    Model: Withdrawal
})





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




