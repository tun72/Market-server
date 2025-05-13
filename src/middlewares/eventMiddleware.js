const catchAsync = require("../utils/catchAsync");
const upload = require("../utils/upload");
const fs = require("fs/promises")
const path = require("node:path");
const resizeImage = require("../utils/resizeImage");
const helper = require("../utils/helpers");
const { Event } = require("../models/eventsModel");
const { getSocket, userSocketMap } = require("../socket");
const { Seller } = require("../models/userModel");
const Notification = require("../models/notificationModel")


exports.isEventExit = helper.isExist(Event)
exports.updateImage = helper.updateImage({ Model: Event, fieldNames: ["poster"] })


exports.uploadImage = upload.fields(
    [
        { name: "poster", maxCount: 1 },
    ]
)

exports.resizeImage = catchAsync(async (req, res, next) => {
    if (!req.files.poster) return next();
    const directory = path.join(__dirname, "../", "../", 'public', 'img', 'events', 'poster');
    await fs.mkdir(directory, { recursive: true });
    const name = `poster-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpeg`
    await resizeImage(directory + "/" + name, 1200, 628, req.files.poster[0].buffer)
    req.body.poster = `img/events/poster/${name}`
    next()
})




exports.sendEventNotification = catchAsync(async (req, res, next) => {
    const io = getSocket();


    await Promise.all(Array.from(userSocketMap.entries()).map(
        async ([userId, socketId]) => {
            const seller = await Seller.findById(userId);
            if (!seller) return;  // skip if no seller

            const notification = await Notification.create({
                reciver: seller._id,
                type: "event",
                link: "events",
                message: "New Event Alert!",
            });

            io.to(socketId).emit('admin_notification', notification);
        })
    )

    next();
});





