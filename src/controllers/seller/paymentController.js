// history
const { body, param, validationResult } = require("express-validator");
const { resume } = require("../../jobs/queues/ImageQueue");
const { PaymentHistory, PaymentCategory } = require("../../models/paymentCategoryModel");
const Seller = require("../../models/sellerModel");
const AppError = require("../../utils/appError");
const catchAsync = require("../../utils/catchAsync");
const factory = require("../handlerFactory");
const { default: mongoose } = require("mongoose");
const { removeImages } = require("../../utils/fileDelete");
const { checkPhotoIfNotExistFields } = require("../../utils/check");
const ImageQueue = require("../../jobs/queues/ImageQueue");

// history
exports.getAllPaymentHistory = [
    catchAsync(async (req, res, next) => {
        const userId = req.userId;
        const merchant = await Seller.findById(userId)
        if (!merchant) {
            next(new AppError("You'r not allowed this action."), 403)
        }

        req.query = {
            merchant: merchant.id
        }
        next()
    }), factory.getAll({
        Model: PaymentHistory,
        // fields: ["customer",],
    })
]


// create payement methods
exports.createPaymentMethod = [
    body("pyMethod")
        .notEmpty().withMessage("Payment method type is required")
        .isIn(["KPay", "WavePay"]).withMessage("Invalid payment method type"),

    body("accNumber")
        .notEmpty().withMessage("Account number is required")
        .isString().withMessage("Account number must be a string")
        .trim(),

    body("accName")
        .notEmpty().withMessage("Account name is required")
        .isString().withMessage("Account name must be a string")
        .isLength({ max: 100 }).withMessage("Account name cannot exceed 100 characters")
        .trim(),

    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            if (req.files && req.files["QR"] && req.files["QR"].length > 0) {
                const originalFiles = [req.files["QR"][0].filename]
                removeImages(originalFiles)
            }
            return next(new AppError(errors[0].msg, 400));
        }

        const userId = req.userId;
        const merchant = await Seller.findById(userId).select("_id")
        if (!merchant) {
            if (req.files["QR"]) {
                removeImages([req.files["QR"][0].filename])
            }
            next(new AppError("You'r not allowed this action."), 403)
        }

        let { pyMethod, accNumber, accName } = req.body;
        checkPhotoIfNotExistFields(req.files, ["QR"])
        const splitName = req.files["QR"][0].filename.split(".")[0] + ".webp"
        await ImageQueue.add("optimize-image", {
            filePath: req.files["QR"][0].path,
            fileName: splitName,
            width: 300,
            height: 300,
            quality: 100,
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 1000,
            },
        })

        const image = req.files["QR"][0].filename

        const data = {
            QR: image,
            merchant: merchant._id,
            pyMethod,
            accNumber,
            accName,
            active: true
        }

        await PaymentCategory.create(data)
        res.status(200).json({ message: "New Payment Method is successfully created", isSuccess: true })
    })
];

// update Payment
exports.updatePaymentMethod = [
    body("id", "Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),

    body("pyMethod")
        .notEmpty().withMessage("Payment method type is required")
        .isIn(["KPay", "WavePay"]).withMessage("Invalid payment method type"),

    body("accNumber")
        .notEmpty().withMessage("Account number is required")
        .isString().withMessage("Account number must be a string")
        .trim(),

    body("accName")
        .notEmpty().withMessage("Account name is required")
        .isString().withMessage("Account name must be a string")
        .isLength({ max: 100 }).withMessage("Account name cannot exceed 100 characters")
        .trim(),

    body("Active")
        .optional()
        .isBoolean().withMessage("Active must be a boolean"),

    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {

            if (req.files["QR"] && req.files["QR"].length > 0) {
                const originalFiles = [req.files["QR"][0].filename]
                removeImages(originalFiles)
            }
            return next(new AppError(errors[0].msg, 400));
        }

        const userId = req.userId;
        const merchant = await Seller.findById(userId)
        if (!merchant) {
            if (req.files["QR"]) {
                removeImages([req.files["QR"][0].filename])
            }
            next(new AppError("You'r not allowed this action."), 403)
        }

        let { pyMethod, accNumber, accName, active, id } = req.body;
        const paymentMethod = await PaymentCategory.findOne({
            merchant: merchant._id, _id: id
        });
        if (!paymentMethod) {
            if (req.files["QR"]) {
                removeImages([req.files["QR"][0].filename])
            }
            return next(new AppError("Payneent Method is not found", 409));
        }

        const data = {
            pyMethod,
            accName,
            accNumber,
            active: active ? active : paymentMethod.active
        }

        if (req.files["QR"]) {
            const splitName = req.files["QR"][0].filename.split(".")[0] + ".webp"
            removeImages([paymentMethod["QR"]], [paymentMethod["QR"].split(".")[0] + ".webp"])
            data["QR"] = req.files["QR"][0].filename;

            await ImageQueue.add("optimize-image", {
                filePath: req.files["QR"][0].path,
                fileName: splitName,
                width: 300,
                height: 300,
                quality: 100,
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
            })
        }

        await PaymentCategory.findByIdAndUpdate(paymentMethod._id, data)
        res.status(200).json({ message: "Payment Method is successfully update", isSuccess: true })
    })
];


exports.deletePaymentMethod = [
    body("id", "Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        let data = req.body;
        const paymentMethod = await PaymentCategory.findById(data.id);
        if (!paymentMethod) {
            return next(new AppError("Payment not found", 409));
        }

        const originalFiles = [paymentMethod.QR];
        const optimizeFiles = originalFiles.map((file) => file.split(".")[0] + ".webp")
        await removeImages(originalFiles, optimizeFiles);
        await PaymentCategory.findByIdAndDelete(paymentMethod._id)
        res.status(200).json({ message: "Payment Method is successfully deleted", isSuccess: true })

    })]

// get payment 
exports.getPaymentMethod = [
    catchAsync(async (req, res, next) => {
        const userId = req.userId;
        const merchant = await Seller.findById(userId)
        if (!merchant) {
            next(new AppError("You'r not allowed this action."), 403)
        }

        req.query = {
            merchant: merchant.id
        }
        next()
    }), factory.getAll({
        Model: PaymentCategory,
        // fields: ["customer",],
    })
]

// get One Method
exports.getPaymentMethodById = [
    param("id", "Id is required").notEmpty().custom((value) => {
        if (mongoose.Types.ObjectId.isValid(value)) {
            return true
        }
        return false
    }, "Id is not valid"),
    catchAsync(async (req, res, next) => {
        const userId = req.userId;
        const merchant = await Seller.findById(userId)
        const id = req.params;
        if (!merchant) {
            next(new AppError("You'r not allowed this action."), 403)
        }

        const isExist = await PaymentCategory.findOne({ merchant: merchant._id, _id: id })

        if (!isExist) {
            next(new AppError("You'r not allowed this action", 403))
        }
        next()
    }), factory.getOne({
        Model: PaymentCategory,
        // fields: ["customer",],
    })
]


// withdraw
// exports.withDraw = [
//     body("id", "Id is required.").custom((id) => {
//         return mongoose.Types.ObjectId.isValid(id);
//     }),
//     catchAsync(async (req, res, next) => {
//         const errors = validationResult(req).array({ onlyFirstError: true });
//         if (errors.length) {
//             return next(new AppError(errors[0].msg, 400));
//         }

//         let data = req.body;
//         const paymentMethod = await PaymentCategory.findById(data.id);
//         if (!paymentMethod) {
//             return next(new AppError("Payment not found", 409));
//         }

//         const originalFiles = [paymentMethod.QR];
//         const optimizeFiles = originalFiles.map((file) => file.split(".")[0] + ".webp")
//         await removeImages(originalFiles, optimizeFiles);
//         await PaymentCategory.findByIdAndDelete(paymentMethod._id)
//         res.status(200).json({ message: "Payment Method is successfully deleted", isSuccess: true })

//     })]