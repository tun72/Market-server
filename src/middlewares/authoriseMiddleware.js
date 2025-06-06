const User = require("../models/userModel");
const AppError = require("../utils/appError");



const authorise = (permission, ...roles) =>
    async (req, res, next) => {
        const userId = req.userId;
        const user = await User.findById(userId);

        console.log(user.role);

        if (!user) {
            return next(new AppError("Your Account is no register!", 401));
        }

        const result = roles.includes(user.role);


        if (permission && !result) {
            return next(new AppError("This action is not allowed", 403));
        }

        if (!permission && result) {
            return next(new AppError("This action is not allowed", 403));
        }
        req.user = user;
        next();
    };
module.exports = authorise