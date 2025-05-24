const { Customer, User } = require("../models/userModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

const { generateToken } = require("../utils/generateToken");

const createSendToken = async ({ user, res, statusCode, next }) => {
    if (!user) return next(new AppError("User is required to create token", 404));
    const token = await generateToken({ id: user.id });
    user.password = undefined;
    return res.status(statusCode).json({
        token,
        data: {
            user,
        },
    });
};

exports.signIn = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password)
        return next(new AppError("Please provide email and password", 400));

    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.correctPassword(password, user.password)))
        return next(new AppError("Incorrect Email or Password.", 401));

    createSendToken({ user, res, statusCode: 200, next });
});

exports.signUp = catchAsync(async (req, res, next) => {
    const { email, password, passwordConfirm, name } = req.body;

    const newUser = await Customer.create({ name, password, passwordConfirm, email });

    createSendToken({ user: newUser, res, statusCode: 202, next });
});
