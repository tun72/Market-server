const { body, validationResult } = require("express-validator");
const catchAsync = require("../../utils/catchAsync");
const { removeImages } = require("../../utils/fileDelete");
const { checkPhotoIfNotExistFields } = require("../../utils/check");

const AppError = require("../../utils/appError");
const ImageQueue = require("../../jobs/queues/ImageQueue");
const factory = require("../handlerFactory");
const mongoose = require("mongoose")
const { decode } = require('html-entities');
const { Type } = require("../../models/productModel");

exports.getAllTypes = factory.getAll({ Model: Type })

exports.getTypesById = factory.getOne({ Model: Type })

exports.createType = [
    body("name", "Name is required.").trim("").notEmpty().escape(),
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
            name,
            image,

        }

        await Type.create(data)
        res.status(200).json({ message: "Type is successfully created", isSuccess: true })

    })
]

exports.updateType = [
    body("name", "Name is required.").trim("").notEmpty().escape(),
    body("id", "Type id is required.").custom((id) => {
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

        const type = await Type.findById(data.id);
        if (!type) {
            if (req.files["image"]) {
                removeImages([req.files["image"][0].filename])
            }
            return next(new AppError("Types not found", 409));
        }


        if (req.files["image"]) {
            const splitName = req.files["image"][0].filename.split(".")[0] + ".webp"
            removeImages([type["image"]], [type["image"].split(".")[0] + ".webp"])
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

        await Type.findByIdAndUpdate(type._id, data)
        res.status(200).json({ message: "Type is successfully updated", isSuccess: true })

    })
]

exports.deleteType = [
    body("id", "Type Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        let data = req.body;
        const type = await Type.findById(data.id);
        if (!type) {
            return next(new AppError("Seller not found", 409));
        }

        const originalFiles = [type.image];
        const optimizeFiles = originalFiles.map((file) => file.split(".")[0] + ".webp")
        await removeImages(originalFiles, optimizeFiles);
        await Type.findByIdAndDelete(type._id)
        res.status(200).json({ message: "Type is successfully deleted", isSuccess: true })

    })]