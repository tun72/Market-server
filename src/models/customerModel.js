const mongoose = require("mongoose");
const User = require("./userModel");

const customerSchema = new mongoose.Schema({
    phone: {
        type: String,
    },
    googleId: {
        type: String,
    },
    shippingAddresse: {
        street: String,
        city: String,
        state: String,
        country: String,
        postalCode: String,
    },
    image: {
        type: String
    },
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

customerSchema.virtual('optimize_images').get(function () {
    return this?.image ? this.image.split(".")[0] + ".webp" : undefined
});

const Customer = User.discriminator("customer", customerSchema);
module.exports = Customer