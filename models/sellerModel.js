const { Schema, model } = require('mongoose');
const validator = require("validator");
const bcrypt = require('bcryptjs');
const { ObjectId } = Schema.Types;
const path = require('path');
const fileDelete = require('../utils/fileDelete');

const sellerSchema = new Schema(
    {
        name: {
            type: String,
            required: [true, "Please tell us your name!"],
            trim: true,
            maxlength: [100, "Name cannot exceed 100 characters"],
            match: [/^[a-zA-Z ]+$/, "Name can only contain letters and spaces"]
        },
        email: {
            type: String,
            required: [true, "Please provide your email"],
            unique: true,
            lowercase: true,
            validate: {
                validator: function (v) {
                    if (!validator.isEmail(v)) return false
                },
                message: "Password must contain at least one uppercase, one lowercase, one number, and one special character"
            },
            index: true
        },
        password: {
            type: String,
            required: [true, "Please provide a password"],
            minlength: [8, "Password must be at least 8 characters"],
            validate: {
                validator: function (v) {

                    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(v);
                },
                message: "Password must contain at least one uppercase, one lowercase, one number, and one special character"
            },
            select: false
        },
        passwordConfirm: {
            type: String,
            required: [true, "Please confirm your password"],
            validate: {
                validator: function (el) {
                    return el === this.password;
                },
                message: "Passwords do not match!"
            }
        },
        phone: {
            type: String,
            required: [true, "Phone number is required"],
            validate: {
                validator: function (v) {
                    return /^\+?[1-9]\d{1,14}$/.test(v);
                },
                message: "Please provide a valid international phone number"
            },
            index: true
        },
        address: {
            street: {
                type: String,
                trim: true,
                maxlength: [200, "Street address cannot exceed 200 characters"]
            },
            city: {
                type: String,
                trim: true,
                maxlength: [100, "City name cannot exceed 100 characters"]
            },
            state: {
                type: String,
                trim: true,
                uppercase: true,
                validate: {
                    validator: function (v) {
                        return /^[A-Z]{2,3}$/.test(v);
                    },
                    message: "State must be a 2 or 3 letter abbreviation"
                }
            },
        },
        status: {
            type: String,
            enum: {
                values: ['pending', 'verified', 'rejected'],
                message: "Invalid seller status"
            },
            default: 'pending',
            index: true
        },
        description: {
            type: String,
            trim: true,
            maxlength: [1000, "Description cannot exceed 1000 characters"]
        },
        logo: {
            type: String,
            trim: true,
            validate: [validator.isURL, "Please provide a valid logo URL"],
        },
        rating: {
            type: Number,
            min: [0, "Rating cannot be less than 0"],
            max: [5, "Rating cannot exceed 5"],
            default: null,
            set: v => v ? Math.round(v * 10) / 10 : null
        },
        NRCNumber: {
            type: String,
            unique: true,
            uppercase: true,
            trim: true,
            required: true
        },
        NRCPhoto: {
            type: String,
            required: true
        },
        amount: {
            type: Number,
            min: [0, "Balance cannot be negative"],
            default: 0
        },
        lastLogin: {
            type: Date,
            default: null
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

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

sellerSchema.virtual('address.full').get(function () {
    return `${this.address.street}, ${this.address.city}, ${this.address.state}`;
});

sellerSchema.index({ email: 1 }, { unique: true });
sellerSchema.index({ phone: 1 }, { unique: true });
sellerSchema.index({ rating: -1 });
sellerSchema.index({ createdAt: 1 });

sellerSchema.pre("save", async function (next) {

});

sellerSchema.pre('save', async function (next) {
    if (!this.isModified('email')) return next();
    if (!this.isModified("password")) return next();

    this.password = await bcrypt.hash(this.password, 12);
    this.passwordConfirm = undefined;

    const isUser = await this.constructor.findOne({ email: this.email });
    if (isUser) {
        return next(new Error('Email already exists'));
    }
    next();
});



withDrawSchema.pre('save', async function (next) {
    const seller = await model('Seller').findById(this.seller);
    if (seller.amount < this.amount) {
        return next(new Error('Insufficient balance for withdrawal'));
    }
    next();
});


sellerSchema.pre(/^find/, function (next) {
    this.select('-__v -passwordChangedAt');
    next();
});



sellerSchema.pre(/deleteOne|findOneAndDelete/, async function (next) {
    try {
        const doc = await this.model.findOne(this.getFilter());
        if (!doc) return next();
        // List of photo fields to delete
        const photoFields = ["logo", 'NRCPhoto'];
        await Promise.all(
            photoFields.map(async (field) => {
                if (doc[field]) {
                    const filePath = path.join(
                        __dirname, "../", "public",
                        doc[field]
                    );
                    console.log(filePath);
                    await fileDelete(filePath)
                }
            })
        );
        next();
    } catch (err) {
        next(err);
    }
});



module.exports = {
    Seller: model('Seller', sellerSchema),
    PaymentCategory: model('PaymentCategory', paymentCategorySchema),
    Withdrawal: model('Withdrawal', withDrawSchema)
};