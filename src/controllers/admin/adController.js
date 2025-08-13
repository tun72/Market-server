const { body, validationResult } = require("express-validator");
const catchAsync = require("../../utils/catchAsync");
const { removeImages } = require("../../utils/fileDelete");
const { checkPhotoIfNotExistFields } = require("../../utils/check");
const Ad = require("../../models/adModel");
const AppError = require("../../utils/appError");
const ImageQueue = require("../../jobs/queues/ImageQueue");
const factory = require("../handlerFactory");
const mongoose = require("mongoose")
const { decode } = require('html-entities');

exports.getAllAds = factory.getAll({ Model: Ad })
exports.getADsById = factory.getOne({ Model: Ad })

exports.createAd = [
    body("link", "Link is required.").trim("").notEmpty().escape(),
    body("company", "Company name is required.").trim("").notEmpty().escape(),
    body("product", "product name is required.").trim("").notEmpty().escape(),

    catchAsync(async (req, res, next) => {

        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {

            if (req.files["image"] && req.files["image"].length > 0) {
                const originalFiles = [req.files["image"][0].filename]
                removeImages(originalFiles)
            }


            return next(new AppError(errors[0].msg, 400));
        }

        let { link, company, product } = req.body;
        checkPhotoIfNotExistFields(req.files, ["image"])

        // need to create aws s3 
        // image optimize

        const splitName = req.files["image"][0].filename.split(".")[0] + ".webp"
        await ImageQueue.add("optimize-image", {
            filePath: req.files["image"][0].path,
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


        const image = req.files["image"][0].filename


        console.log(image);

        const data = {
            link: decode(link),
            image,
            company,
            product
        }

        const ad = await Ad.create(data)
        res.status(200).json({ message: "Ad is successfully created", isSuccess: true })

    })
]

exports.updateAd = [
    body("link", "Link is required.").trim("").notEmpty().escape(),
    body("company", "Company name is required.").trim("").notEmpty().escape(),
    body("product", "product name is required.").trim("").notEmpty().escape(),
    body("id", "Ad Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),
    catchAsync(async (req, res, next) => {

        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {

            if (req.files["image"] && req.files["image"].length > 0) {
                const originalFiles = [req.files["image"][0].filename]
                removeImages(originalFiles)
            }


            return next(new AppError(errors[0].msg, 400));
        }

        let data = req.body;
        // need to create aws s3 
        // image optimize

        const ads = await Ad.findById(data.id);
        if (!ads) {
            if (req.files["image"]) {
                removeImages([req.files["image"][0].filename])
            }
            return next(new AppError("Ads not found", 409));
        }


        if (req.files["image"]) {
            const splitName = req.files["image"][0].filename.split(".")[0] + ".webp"
            removeImages([ads["image"]], [ads["image"].split(".")[0] + ".webp"])
            data["image"] = req.files["image"][0].filename;

            await ImageQueue.add("optimize-image", {
                filePath: req.files["image"][0].path,
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

        data.link = decode(data.link)

        await Ad.findByIdAndUpdate(ads._id, data)
        res.status(200).json({ message: "Ad is successfully update", isSuccess: true })

    })
]

exports.deleteAd = [
    body("id", "Ad Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        let data = req.body;
        const ads = await Ad.findById(data.id);
        if (!ads) {
            return next(new AppError("Seller not found", 409));
        }

        const originalFiles = [ads.image];
        const optimizeFiles = originalFiles.map((file) => file.split(".")[0] + ".webp")
        await removeImages(originalFiles, optimizeFiles);
        await Ad.findByIdAndDelete(ads._id)
        res.status(200).json({ message: "Ad is successfully deleted", isSuccess: true })

    })]