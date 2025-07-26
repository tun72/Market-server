const { body, validationResult } = require("express-validator");
const Order = require("../../models/orderModel");
const Seller = require("../../models/sellerModel");
const AppError = require("../../utils/appError");
const catchAsync = require("../../utils/catchAsync");
const factory = require("../handlerFactory");

exports.getAllOrders = [
    catchAsync(async (req, res, next) => {
        const userId = req.userId
        const merchant = await Seller.findById(userId)
        if (!merchant) {
            next(AppError("This account is not registered.", 403))
        }
        req.query.merchant = merchant.id
        next()
    }), factory.getAll({
        Model: Order,
        fields: ["productId", "userId"]

    })
]


exports.updateOrders = [
    body("orderId", "Order Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),
    body("status", "Status is required").notEmpty().custom((value) => {
        const all_status = ["pending", "confirm", "cancel", "delivery", "success"]

        if (!all_status.include(value)) {
            return false
        }
        return true
    }, "Invalid status."),

    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }
        let { orderId, status } = req.body;
        const order = await Order.findById(orderId)
        if (!order) {
            return next(new AppError("No order found with that Id.", 404))
        }
        await Order.findByIdAndUpdate(order.id, { status: status })
        res.status(200).json({ message: "Order updated successfully." })
    })
]
