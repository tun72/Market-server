const { Schema, model } = require('mongoose');
const orderSchema = new Schema({
    code: {
        type: String,
        unique: true,
        index: true,
        default: () => `ORD-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`
    },
    products: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            required: true
        }
    }],
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: [true, "User is required"]
    },
    merchant: {
        type: ObjectId,
        ref: 'User',
        required: [true, 'Merchant is required'],
        index: true
    },
    payment: {
        type: String,
        required: true
    }

}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
})



module.exports = model("Order", orderSchema)