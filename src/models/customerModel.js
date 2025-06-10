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