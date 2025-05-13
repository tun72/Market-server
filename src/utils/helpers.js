const catchAsync = require("./catchAsync");
const AppError = require("../utils/appError");
const mongoose = require("mongoose")
const path = require("path");
const fileDelete = require("./fileDelete");
const isExist = (Model) =>
    catchAsync(async (req, res, next) => {
        const id = req.params.id;
        if (!mongoose.isValidObjectId(id)) {
            return next(new AppError("Is not valid ID", 404));
        }
        const doc = await Model.findById(id);
        if (!doc) {
            return next(new AppError("No document found with that ID", 404));
        }
        next()
    });

const isAlreadyExist = (Model) =>
    catchAsync(async (req, res, next) => {
        const isUser = await Model.findOne({ email: req.body.email });
        if (isUser) {
            return next(new Error('Email already exists'));
        }
        next()
    });


const updateImage = ({ Model, fieldNames = [] }) => catchAsync(async (req, res, next) => {

    if (fieldNames.length === 0) {
        next()
    }

    const originalDoc = await Model.findById(req.params.id)
    await Promise.all(
        fieldNames.map(async (name) => {
            if (req.body[name]) {
                const filePath = path.join(
                    __dirname, "../", "../", "public",
                    originalDoc[name]
                );
                await fileDelete(filePath)
            }
        }))
    next()
})

module.exports = {
    isExist,
    updateImage,
    isAlreadyExist
}