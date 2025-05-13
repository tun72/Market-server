const mongoose = require('mongoose');
const Schema = mongoose.Schema;



const notificationSchema = new Schema({
    reciver: {
        type: Schema.Types.ObjectId,
        ref: 'Seller',
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: ['order', 'message', 'system', 'event', 'alert', 'payment'],
        index: true
    },
    link: {
        type: String
    },
    message: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['unread', 'read', 'archived'],
        default: 'unread',
        index: true
    },

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});


module.exports = mongoose.model('Notification', notificationSchema);