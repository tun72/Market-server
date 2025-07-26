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
    })
]


// exports.updateOrders = [
//     body("orderId", "Order Id is required.").custom((id) => {
//         return mongoose.Types.ObjectId.isValid(id);
//     }),
//     body("status", "Status is required").notEmpty(),

//     catchAsync(async (req, res, next) => {
//         const errors = validationResult(req).array({ onlyFirstError: true });
//         if (errors.length) {
//             return next(new AppError(errors[0].msg, 400));
//         }

//         let { orderId } = req.body;

//         const order = await Order.findById(orderId)

//         if (!order) {
//             return next(new AppError("No order found with that Id.", 404))
//         }

//         const originalFiles = product.images;
//         const optimizeFiles = originalFiles.map((file) => file.split(".")[0] + ".webp")
//         await removeImages(originalFiles, optimizeFiles);

//         await Product.findByIdAndDelete(product._id)

//         res.status(200).json({ message: "Product successfully deleted." })

//     })
// ]
