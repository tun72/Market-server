const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const orderSchema = new Schema({
    code: {
        type: String,
        index: true,
        default: () => `ORD-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`
    },
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: [true, "User is required"]
    },
    payment: {
        type: String,
        enum: ["cod", "stripe", "unpaid"],
        default: "unpaid"
    },
    stripeSessionId: {
        type: String,
    },
    isPaid: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ["pending", "accept", "cancel", "delivery", "success"],
        default: "pending"
    },
    quantity: {
        type: Number,
        required: true
    },
    merchant: {
        type: Schema.Types.ObjectId,
        ref: "seller"
    },
    isDelivered: {
        type: Boolean,
        required: true,
        default: false,
    },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

module.exports = model("Order", orderSchema);