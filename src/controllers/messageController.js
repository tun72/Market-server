
const factory = require("./handlerFactory");
const Message = require("../models/messageModel");
const catchAsync = require("../utils/catchAsync");
const Admin = require("../models/adminModel");
const AppError = require("../utils/appError");
exports.aliasMessages = (req, res, next) => {
    const user1 = req.userId;
    const user2 = req.body.id;


    req.query.sort = "timestamp";
    req.query.or = { sender: user1, recipient: user2 }

    next();
};

exports.getAllMessages = factory.getAll({ Model: Message })


exports.getAdminId = catchAsync(async (req, res, next) => {
    const admin = await Admin.findOne({ email: "admin@gmail.com" }).select("_id")

    console.log(admin);


    res.status(200).json({
        isSuccess: true,
        adminId: admin.id
    })
})





exports.getContactForDMList = catchAsync(async (req, res, next) => {
    const userId = req.userId;
    console.log(userId);

    const admin = await Admin.findById(userId)

    if (!admin) {
        next(new AppError("You're not allowed.", 403))
    }

    const contacts = await Message.aggregate([
        {
            $match: {
                $or: [{ sender: admin._id }, { recipient: admin._id }],
            },
        },
        {
            $sort: { timestamp: -1 },
        },
        {
            $group: {
                _id: {
                    $cond: {
                        if: { $eq: ["$sender", admin._id] },
                        then: "$recipient",
                        else: "$sender",
                    },
                },
                lastMessageTime: { $first: "$timestamp" },
                message: { $first: "$message" }
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "contactInfo",
            },
        },
        {
            $unwind: "$contactInfo",
        },
        {
            $project: {
                _id: 1,
                lastMessageTime: 1,
                email: "$contactInfo.email",
                username: "$contactInfo.name",
                image: "$contactInfo.image",
                message: 1
            },
        },
        {
            $sort: { lastMessageTime: -1 },
        },
    ]);




    return res.status(200).json({ contacts });
});
