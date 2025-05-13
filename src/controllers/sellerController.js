const { Event, Participant } = require("../models/eventsModel");
const { Product } = require("../models/productModel");
const catchAsync = require("../utils/catchAsync");
const factory = require("./handlerFactory");


exports.getAllEvents = factory.getAll({ Model: Event })
exports.getEventById = factory.getOne(Event)

exports.joinEvent = catchAsync(async (req, res, next) => {


    const productId = req.body.productId;
    const eventId = req.body.eventId;
    const discount = req.body.discount;

    const isAlreadyExist = await Participant.findOne(
        {
            event: eventId,
            'products.product': productId
        },
        {
            'products.$': 1
        }
    ).lean();

    if (isAlreadyExist) return res.status(401).json({ message: "Products Already Exist!" })

    const product = await Product.findById(p.product).select('price name');

    if (!product) return res.status(401).json({ message: "Product is not Exist!" })

    const originalPrice = prod.price;

    return {
        product: p.product,
        discount,
        startDate: p.startDate,
        endDate: p.endDate,
        originalPrice,
    }

    const participant = new Participant({ event, seller, products: populated });
    return participant.save();


})
