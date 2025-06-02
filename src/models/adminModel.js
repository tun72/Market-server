const mongoose = require("mongoose");
const User = require("./userModel");


const adminSchema = new mongoose.Schema({
    accessLevel: {
        type: Number,
        default: 1, // 1 = basic admin, 2 = super admin, etc.
    },
});
const Admin = User.discriminator("admin", adminSchema)

module.exports = Admin