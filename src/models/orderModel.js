const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const orderSchema = new Schema({
    code: {
        type: String,
        index: true,
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
        enum: ["pending", "processing", "confirm", "cancel", "delivery", "success", "expired"],
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

    inventoryReserved: { type: Boolean, default: false },
    reservedAt: Date,
    stripePaymentIntentId: String,
    refundReason: String,
    refundInitiatedAt: Date,
    refundedAt: Date,
    stripeRefundId: String,
    refundError: String
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

module.exports = model("Order", orderSchema);