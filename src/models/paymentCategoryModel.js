const { Schema, model } = require('mongoose');
const validator = require("validator");
const { ObjectId } = Schema.Types;




const paymentCategorySchema = new Schema({
    seller: {
        type: ObjectId,
        ref: 'Seller',
        required: [true, "Payment method must belong to a seller"]
    },
    pyMethod: {
        type: String,
        required: [true, "Payment method type is required"],
        enum: {
            values: ['KPay', 'WavePay'],
            message: "Invalid payment method type"
        }
    },
    accNumber: {
        type: String,
        required: [true, "Account number is required"],
        trim: true,
        select: false
    },
    accName: {
        type: String,
        required: [true, "Account name is required"],
        trim: true,
        maxlength: [100, "Account name cannot exceed 100 characters"]
    },
    QR: {
        type: String,
        validate: [validator.isURL, "Please provide a valid QR code URL"]
    },
    status: {
        type: Boolean,
        default: false
    },
    verifiedAt: Date
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const withDrawSchema = new Schema({
    amount: {
        type: Number,
        required: [true, "Withdrawal amount is required"],
        min: [0.01, "Withdrawal amount must be at least 0.01"]
    },
    currency: {
        type: String,
        default: 'MMK',
        enum: ['MMK']
    },
    seller: {
        type: ObjectId,
        ref: 'Seller',
        required: [true, "Withdrawal must belong to a seller"]
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    transactionId: String,
    processedAt: Date
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});



withDrawSchema.pre('save', async function (next) {
    const seller = await model('Seller').findById(this.seller);
    if (seller.amount < this.amount) {
        return next(new Error('Insufficient balance for withdrawal'));
    }
    next();
});

module.exports = {
    PaymentCategory: model('PaymentCategory', paymentCategorySchema),
    Withdraw: model('Withdraw', withDrawSchema)
};