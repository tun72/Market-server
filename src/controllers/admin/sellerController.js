const { body, validationResult } = require("express-validator");
const Seller = require("../../models/sellerModel");

const factory = require("../handlerFactory");
const catchAsync = require("../../utils/catchAsync");
const { removeImages } = require("../../utils/fileDelete");
const AppError = require("../../utils/appError");
const { checkPhotoIfNotExistFields } = require("../../utils/check");
const ImageQueue = require("../../jobs/queues/ImageQueue");
const { generateRandToken } = require("../../utils/generateToken");
const { default: mongoose } = require("mongoose");
// Seller
exports.getAllSellers = factory.getAll({
    Model: Seller,
});

exports.getSellerById = factory.getOne({
    Model: Seller
})

exports.createSeller = [
    body("email", "Invalid Email").trim("").isEmail().notEmpty(),
    body("password").trim("")
        .notEmpty()
        .isLength({ min: 8 })
        .withMessage("Password must be minium of 8 characters."),
    body("passwordConfirm").trim("").notEmpty().isLength({ min: 8 })
        .withMessage("Password must be minium of 8 characters."),
    body("name", "Name is required").trim("").notEmpty(),
    body("phone", "Phone is required").trim("").notEmpty(),
    body("street", "Street is required").trim("").notEmpty(),
    body("city", "City is required").trim("").notEmpty(),
    body("state", "State is required").trim("").notEmpty(),
    body("country", "Country is required").trim("").notEmpty(),
    body("description", "Description is required").trim("").notEmpty(),
    body("businessName", "Business Name is required").trim("").notEmpty(),
    body("NRCNumber", "NRCNumber is required").trim("").notEmpty(),

    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });

        if (errors.length) {
            if (req.files) {
                if (req.files["logo"]) {

                    removeImages([req.files["logo"][0].filename])
                }

                if (req.files["NRCFront"]) {

                    removeImages([req.files["NRCFront"][0].filename])
                }

                if (req.files["NRCBack"]) {

                    removeImages([req.files["NRCBack"][0].filename])
                }

            }
            return next(new AppError(errors[0].msg, 400));
        }

        const seller = req.body

        try {
            checkPhotoIfNotExistFields(req.files, ["logo", "NRCFront", "NRCBack"])
        } catch (err) {
            if (req.files) {
                if (req.files["logo"]) {

                    removeImages([req.files["logo"][0].filename])
                }

                if (req.files["NRCFront"]) {

                    removeImages([req.files["NRCFront"][0].filename])
                }

                if (req.files["NRCBack"]) {

                    removeImages([req.files["NRCBack"][0].filename])
                }

            }
            return next(new AppError(err.message, 409));
        }

        const isSellerExist = await Seller.findOne({ email: seller.email });
        if (isSellerExist) {
            if (req.files) {
                if (req.files["logo"]) {

                    removeImages([req.files["logo"][0].filename])
                }

                if (req.files["NRCFront"]) {

                    removeImages([req.files["NRCFront"][0].filename])
                }

                if (req.files["NRCBack"]) {

                    removeImages([req.files["NRCBack"][0].filename])
                }
            }
            return next(new AppError("Seller is already exist.", 409));
        }

        // const { logo, NRCFront, NRCBack } = req.files;

        // need to add new folder
        const fileNames = ["logo", "NRCFront", "NRCBack"]
        await Promise.all(fileNames.map(async (file) => {
            const splitName = req.files[file][0].filename.split(".")[0] + ".webp"
            await ImageQueue.add("optimize-image", {
                filePath: req.files[file][0].path,
                fileName: splitName,
                width: 835,
                height: 577,
                quality: 100,
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
            })
        }))

        seller.logo = req.files["logo"][0].filename;
        seller.NRCFront = req.files["NRCFront"][0].filename;
        seller.NRCBack = req.files["NRCBack"][0].filename;
        seller.randToken = generateRandToken()
        seller.address = {
            street: seller.street,
            city: seller.city,
            state: seller.state,
            country: seller.country
        }
        const newSeller = await Seller.create(seller);

        res.status(200).json({ message: "Product successfully created", data: { seller: newSeller } });

    })
]

exports.updateSeller = [
    body("id", "Seller Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),
    body("email", "Invalid Email").trim("").isEmail().notEmpty(),
    body("password").trim("")
        .notEmpty()
        .isLength({ min: 8 })
        .withMessage("Password must be minium of 8 characters."),
    body("passwordConfirm").trim("").notEmpty().isLength({ min: 8 })
        .withMessage("Password must be minium of 8 characters."),
    body("name", "Name is required").trim("").notEmpty(),
    body("phone", "Phone is required").trim("").notEmpty(),
    body("street", "Street is required").trim("").notEmpty(),
    body("city", "City is required").trim("").notEmpty(),
    body("state", "State is required").trim("").notEmpty(),
    body("country", "Country is required").trim("").notEmpty(),
    body("description", "Description is required").trim("").notEmpty(),
    body("businessName", "Business Name is required").trim("").notEmpty(),
    body("NRCNumber", "NRCNumber is required").trim("").notEmpty(),

    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });

        if (errors.length) {
            if (req.files) {
                if (req.files["logo"]) {

                    removeImages([req.files["logo"][0].filename])
                }

                if (req.files["NRCFront"]) {

                    removeImages([req.files["NRCFront"][0].filename])
                }

                if (req.files["NRCBack"]) {

                    removeImages([req.files["NRCBack"][0].filename])
                }

            }
            return next(new AppError(errors[0].msg, 400));
        }

        const data = req.body


        const seller = await Seller.findById(data.id);
        if (!seller) {
            if (req.files) {
                if (req.files["logo"]) {

                    removeImages([req.files["logo"][0].filename])
                }

                if (req.files["NRCFront"]) {

                    removeImages([req.files["NRCFront"][0].filename])
                }

                if (req.files["NRCBack"]) {

                    removeImages([req.files["NRCBack"][0].filename])
                }
            }
            return next(new AppError("Seller not found", 409));
        }

        console.log(seller);

        // const { logo, NRCFront, NRCBack } = req.files;

        // need to add new folder
        const fileNames = ["logo", "NRCFront", "NRCBack"]

        if (req.files) {
            await Promise.all(fileNames.map(async (file) => {
                if (req.files[file]) {
                    const splitName = req.files[file][0].filename.split(".")[0] + ".webp"
                    removeImages([seller[file]], [seller[file].split(".")[0] + ".webp"])
                    data[file] = req.files[file][0].filename;

                    await ImageQueue.add("optimize-image", {
                        filePath: req.files[file][0].path,
                        fileName: splitName,
                        width: 835,
                        height: 577,
                        quality: 100,
                    }, {
                        attempts: 3,
                        backoff: {
                            type: "exponential",
                            delay: 1000,
                        },
                    })
                }

            }))

        }




        data.address = {
            street: data.street,
            city: data.city,
            state: data.state,
            country: data.country
        }
        const updateSeller = await Seller.findByIdAndUpdate(data.id, data)

        res.status(200).json({ message: "Seller successfully updated", data: { seller: updateSeller } });

    })
]

// exports.updateSeller = factory.updateOne(Seller)
// exports.deleteSeller = factory.deleteOne(Seller)
