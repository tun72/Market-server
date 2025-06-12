const { body, validationResult } = require("express-validator");
const Customer = require("../models/customerModel");
const User = require("../models/userModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const dotenv = require("dotenv");
dotenv.config()
const { generateAccessToken, generateRefreshToken, generateRandToken } = require("../utils/generateToken");

const createSendToken = async ({ user, res, statusCode, next }) => {
    if (!user) return next(new AppError("User is required to create token", 404));

    const accessToken = await generateAccessToken({ id: user.id });
    const refreshToken = await generateRefreshToken({ id: user.id, email: user.email });


    await User.findByIdAndUpdate(user._id, { randToken: refreshToken });

    res
        .cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            maxAge: 15 * 60 * 1000,
        })
        .cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            maxAge: 30 * 24 * 60 * 60 * 1000,
        })
        .status(statusCode)
        .json({
            isSuccess: true,
            message: statusCode === 201 ? "User account successfully created" : "Login Success",
            token: accessToken,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            },
        });
};

// user role
exports.signIn = [
    body("email", "Invalid Email").trim("").isEmail().notEmpty(),
    body("password").trim("")
        .notEmpty()
        .isLength({ min: 8 })
        .withMessage("Password must be minium of 8 characters."),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            if (req.files && req.files.length > 0) {
                const originalFiles = req.files.map((file) => file.filename)
                removeImages(originalFiles)
            }
            return next(new AppError(errors[0].msg, 400));
        }
        const { email, password } = req.body;
        const user = await User.findOne({ email }).select("+password");

        if (!user || !(await user.correctPassword(password, user.password)))
            return next(new AppError("Incorrect Email or Password.", 400));

        createSendToken({ user, res, statusCode: 200, next });
    })]

exports.signUp = [
    body("email", "Invalid Email").trim("").isEmail().notEmpty(),
    body("password").trim("")
        .notEmpty()
        .isLength({ min: 8 })
        .withMessage("Password must be minium of 8 characters."),
    body("passwordConfirm").trim("").notEmpty().isLength({ min: 8 })
        .withMessage("Password must be minium of 8 characters."),
    body("name", "Name is required").trim("").notEmpty(),
    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            if (req.files && req.files.length > 0) {
                const originalFiles = req.files.map((file) => file.filename)
                removeImages(originalFiles)
            }
            return next(new AppError(errors[0].msg, 400));
        }
        const { email, password, passwordConfirm, name } = req.body;

        const isUserExit = await User.findOne({ email })

        if (isUserExit) {
            return next(new AppError("Please try with different Account", 400))
        }

        if (password !== passwordConfirm) {
            return next(new AppError("Password are not match", 400))
        }

        const newUser = await Customer.create({ name, password, passwordConfirm, email, randToken: generateRandToken() });

        createSendToken({ user: newUser, res, statusCode: 201, next });
    })]
