const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    message: {
        type: String,
        required: function () {
            return this.messageType === "text";
        },
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: false,
    },
    messageType: {
        type: String,
        enum: ["text", "file"],
        required: true,
    },
    fileUrl: {
        type: String,
        required: function () {
            return this.messageType === "file";
        },
    },
    channelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Channel",
        required: false,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("Message", messageSchema);