const mongoose = require("mongoose");
const path = require("path");
const fileDelete = require("../utils/fileDelete");
const User = require("./userModel");
const bcrypt = require("bcryptjs");
const { selectFields } = require("express-validator/lib/field-selection");



const sellerSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: [true, "Please provide a valid phone number"],
    },
    businessName: {
        type: String,
        required: true,
    },
    logo: {
        type: String,
        required: true,
    },
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
    },
    description: {
        type: String,
    },
    NRCNumber: {
        type: String,
        required: true,
        select: false,
    },
    NRCFront: {
        type: String,
        required: true,
        select: false,

    },
    NRCBack: {
        type: String,
        required: true,
        select: false,
    },
    balance: {
        type: Number,
        default: 0,
        min: [0, "Balance cannot be negative"],
        select: false
    },
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
    },
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});


sellerSchema.virtual("products", {
    ref: "Product",
    localField: "_id",
    foreignField: "merchant",
    justOne: false
});

sellerSchema.virtual('address.full').get(function () {
    return `${this.address.street}, ${this.address.city}, ${this.address.state}`;
});

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

const Seller = User.discriminator("seller", sellerSchema);

module.exports = Seller