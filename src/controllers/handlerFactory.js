const ApiFeature = require("../utils/apiFeatures");
const AppError = require("../utils/appError");
const catchAsync = require("./../utils/catchAsync");
const mongoose = require("mongoose");

exports.getAll = ({ Model, fields = [] }) =>
    catchAsync(async (req, res, next) => {
        let filter = {};

        const page = req.query.page * 1 || 1;
        const limit = req.query.limit * 1 || 100;

        const filteredQuery = new ApiFeature(Model.find(filter), req.query).filter();
        const length = await filteredQuery.query.countDocuments();
        const feature = new ApiFeature(Model.find(filter), req.query)
            .filter()
            .sort()
            .paginate()
            .limits()
            .populate(fields);

        let doc = await feature.query;
        return res.status(200).json({
            status: "sucess",
            data: doc,
            isSuccess: true,
            pagination: {
                entriesPerPage: limit,
                page,
                totalResult: length,
                foundResult: doc.length,
            }
        });
    });

exports.getOne = ({ Model, fields = [] }) =>
    catchAsync(async (req, res, next) => {
        const id = req.params.id;
        if (!mongoose.isValidObjectId(id)) {
            return next(new AppError("Is not valid ID", 404));
        }

        let query = Model.findById(id);

        if (fields.length) query = query.populate(fields.join(" "));
        const doc = await query;

        if (!doc) {
            return next(new AppError("No document found with that ID", 404));
        }

        res.status(200).json({
            status: "success",
            data: {
                data: doc,
            },
            isSuccess: true
        });
    });

exports.createOne = Model =>
    catchAsync(async (req, res, next) => {
        const doc = new Model(req.body);

        await doc.save()

        res.status(201).json({
            status: "success",
            data: {
                data: doc
            },
            isSuccess: true
        })
    })


exports.updateOne = Model =>
    catchAsync(async (req, res, next) => {
        const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        })

        if (!doc) {
            return next(new AppError("No document found within that ID", 404))
        }

        return res.status(200).json({
            status: "success",
            data: {
                data: doc
            },
            isSuccess: true
        })
    })

exports.deleteOne = Model => catchAsync(async (req, res, next) => {
    const doc = await Model.findOneAndDelete({
        _id: req.params.id
    });

    if (!doc) {
        return next(new AppError("No document found within that ID", 404))
    }

    return res.status(204).json({
        status: "success",
        data: [],
        isSuccess: true
    })
})