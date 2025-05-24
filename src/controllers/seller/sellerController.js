const { Event, Participant } = require("../../models/eventsModel");
const Discount = require("../../models/discountModel")
const { Product } = require("../../models/productModel");
const AppError = require("../../utils/appError");
const catchAsync = require("../../utils/catchAsync");
const factory = require("../handlerFactory");


exports.getAllEvents = factory.getAll({ Model: Event })
exports.getEventById = factory.getOne(Event)
// exports.joinEvent = factory.createOne(Participant)

exports.joinEvent = catchAsync(async (req, res, next) => {
    const sellerId = req.body.sellerId;
    const eventId = req.body.eventId;

    if (req.user.id !== sellerId) throw new AppError("Your are not authorized seller!", 403);

    const isAlreadyJoin = await Participant.findOne({ seller: sellerId, event: eventId })

    if (isAlreadyJoin) throw new AppError("Already Joined the event!", 403);

    const newParticipant = await Participant.create({ seller: sellerId, event: eventId });

    return res.status(200).json({ message: "Successfully Joined!", data: { participant: newParticipant } })
})



exports.addDiscount = catchAsync(async (req, res, next) => {
    const { productId, eventId, discount, participantId } = req.body;
    const [product, participant] = await Promise.all([
        Product.findById(productId, 'seller').lean(),
        Participant.findOne(
            { _id: participantId, event: eventId },
            'discountProducts'
        ).lean()
    ]);

    if (!product) {
        return res.status(404).json({ message: 'Product not found' });
    }
    // if (product?.seller?.toString() !== req.user._id.toString()) {
    //     return res.status(403).json({ message: 'Not the product owner' });
    // }
    if (!participant) {
        return res.status(404).json({ message: 'Participant not found for this event' });
    }

    const already = await Discount.exists({ productId });
    if (already) {
        return res.status(400).json({ message: 'Product is already discounted' });
    }

    const newDisc = await Discount.create({
        productId,
        discPercent: discount
    });

    const updatedParticipant = await Participant.findByIdAndUpdate(
        participantId,
        { $push: { discountProducts: newDisc._id } },
        { new: true, select: '-__v', lean: true }
    );

    return res.status(200).json({
        message: 'Discount added successfully',
        data: { participant: updatedParticipant }
    });
});

exports.getParticipant = factory.getOne({ Model: Participant, fields: ["discountProducts"] })

