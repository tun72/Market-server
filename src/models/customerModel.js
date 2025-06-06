const mongoose = require("mongoose");
const User = require("./userModel");

const customerSchema = new mongoose.Schema({
    phone: {
        type: String,
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
    paymentMethods: [
        {
            cardType: String,
            last4: String,
            expiry: String,
            isDefault: Boolean,
        },
    ],
});
const Customer = User.discriminator("customer", customerSchema);
module.exports = Customer