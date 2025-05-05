
const mongoose = require("mongoose")
const validator = require("validator");
const bcrypt = require("bcryptjs")
const adminSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please tell us your name!"],
    },
    email: {
        type: String,
        required: [true, "Please provide your email"],
        unique: true,
        lowercase: true,
        validate: [validator.isEmail, "Please provide a valid email"],
    },
    role: {
        type: String,
        enum: ["admin"],
        default: "admin",
    },
    password: {
        type: String,
        required: [true, "Please provide a password"],
        minlength: 8,
        select: false,
    },
    active: {
        type: Boolean,
        default: true,
        select: false,
    },
});

adminSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 12);
    return next();
});

const Admin = mongoose.model("Admin", adminSchema);
module.exports = Admin

