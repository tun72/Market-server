const Stripe = require("stripe");
const dotenv = require("dotenv");
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = stripe