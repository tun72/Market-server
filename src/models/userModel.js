const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const path = require("path");
const fileDelete = require("../utils/fileDelete");

// Base User Schema
const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Please tell us your name!"],
            trim: true,
            maxlength: [100, "Name cannot exceed 100 characters"],
        },
        email: {
            type: String,
            required: [true, "Please provide your email"],
            unique: true,
            lowercase: true,
            validate: [validator.isEmail, "Please provide a valid email"],
            index: true,
        },
        role: {
            type: String,
            enum: ["customer", "seller", "admin"],
            default: "customer",
        },
        password: {
            type: String,
            required: [true, "Please provide a password"],
            minlength: [8, "Password must be at least 8 characters"],
            select: false,
        },
        passwordConfirm: {
            type: String,
            required: [true, "Please confirm your password"],
            validate: {
                validator: function (el) {
                    return el === this.password;
                },
                message: "Passwords are not the same!",
            },
        },
        active: {
            type: Boolean,
            default: true,
            select: false,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
        discriminatorKey: "role",
    }
);


const customerSchema = new mongoose.Schema({
    phone: {
        type: String,
        validate: {
            validator: function (v) {
                return /^\+?[1-9]\d{1,14}$/.test(v);
            },
            message: "Please provide a valid international phone number",
        },
    },
    shippingAddresses: [
        {
            street: String,
            city: String,
            state: String,
            country: String,
            postalCode: String,
            isDefault: {
                type: Boolean,
                default: false,
            },
        },
    ],
    cart: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
            },
            quantity: {
                type: Number,
                default: 1,
                min: [1, "Quantity can't be less than 1"],
            },
            addedAt: {
                type: Date,
                default: Date.now,
            },
        },
    ],
    wishlist: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
        },
    ],
    paymentMethods: [
        {
            cardType: String,
            last4: String,
            expiry: String,
            isDefault: Boolean,
        },
    ],
});


const sellerSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        validate: {
            validator: function (v) {
                return /^\+?[1-9]\d{1,14}$/.test(v);
            },
            message: "Please provide a valid international phone number",
        },
    },
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        postalCode: String,
    },
    description: {
        type: String,
        maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    NRCNumber: {
        type: String,
        required: true,
        unique: true,
    },
    NRCPhoto: {
        type: String,
        required: true,
    },
    balance: {
        type: Number,
        default: 0,
        min: [0, "Balance cannot be negative"],
    },
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
    },
});


// Delete hook for seller
sellerSchema.pre(/deleteOne|findOneAndDelete/, async function (next) {
    try {
        const doc = await this.model.findOne(this.getFilter());
        if (!doc) return next();

        const photoFields = ["logo", 'NRCPhoto'];
        await Promise.all(
            photoFields.map(async (field) => {
                if (doc[field]) {
                    const filePath = path.join(
                        __dirname, "../", "../", "public",
                        doc[field]
                    );
                    await fileDelete(filePath); // Ensure fileDelete is implemented
                }
            })
        );
        next();
    } catch (err) {
        next(err);
    }
});

sellerSchema.virtual('address.full').get(function () {
    return `${this.address.street}, ${this.address.city}, ${this.address.state}`;
});

userSchema.methods.correctPassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Password Hashing Middleware
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 12);
    this.passwordConfirm = undefined;
    next();
});

// Create base model
const User = mongoose.model("User", userSchema);

// Create discriminators
const Customer = User.discriminator("customer", customerSchema);
const Seller = User.discriminator("seller", sellerSchema);

module.exports = { User, Customer, Seller };



