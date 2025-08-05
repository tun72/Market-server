const mongoose = require("mongoose");
const User = require("./userModel");

const customerSchema = new mongoose.Schema({
    phone: {
        type: String,
    },
    googleId: {
        type: String,
    },
    shippingAddresses: {
        street: String,
        city: String,
        state: String,
        country: String,
        postalCode: String,
    },
    image: {
        type: String
    },
    paymentMethods: [
        {
            cardType: String,
            last: String,
            expiry: String,
            isDefault: Boolean,
        },
    ],
});
const Customer = User.discriminator("customer", customerSchema);
module.exports = Customer