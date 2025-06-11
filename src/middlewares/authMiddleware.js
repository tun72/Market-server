const jwt = require("jsonwebtoken");
const { promisify } = require("util")
const dotenv = require("dotenv");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const User = require("../models/userModel");
const { generateAccessToken, generateRefreshToken } = require("../utils/generateToken");
dotenv.config()

const authMiddleware = catchAsync(async (req, res, next) => {
    let accessToken;
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
    ) {
        accessToken = req.headers.authorization.split(" ")[1];
    }
    console.log(accessToken);


    const refreshToken = req.cookies ? req.cookies.refreshToken : null;

    if (!refreshToken) {
        return next(
            new AppError("You are not authenticated user! Please log in to get access.", 401)
        );
    }

    console.log(refreshToken);


    async function generateNewToken() {
        try {
            const decoded = await promisify(jwt.verify)(refreshToken, process.env.SECRET_KEY);

            const user = await User.findById(decoded.id).select("+randToken")

            if (!user) {
                return next(new AppError("You are not an authenticated user."), 401)
            }

            if (user.email !== decoded.email) {
                return next(new AppError("You are not an authenticated user."), 401)
            }

            if (user.randToken !== refreshToken) {
                return next(new AppError("You are not an authenticated user.", 401))
            }

            const accessToken_new = await generateAccessToken({ id: user.id });
            const refreshToken_new = await generateRefreshToken({ id: user.id, email: user.email });

            await User.findByIdAndUpdate(user._id, { randToken: refreshToken_new });
            res
                .cookie("accessToken", accessToken_new, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
                    maxAge: 15 * 60 * 1000,
                })
                .cookie("refreshToken", refreshToken_new, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
                    maxAge: 30 * 24 * 60 * 60 * 1000,
                })
            req.userId = user._id
            next()

        } catch (error) {
            return next(new AppError("You are not authenticated.", 401));
        }

    }

    if (!accessToken) {
        console.log("not access");

        // generateNewToken()
    } else {
        try {
            const decoded = await promisify(jwt.verify)(accessToken, process.env.SECRET_KEY);
            req.userId = decoded.id;
            next()

        } catch (error) {
            console.log(error);

            if (error.name === "TokenExpiredError") {
                generateNewToken()
            } else {
                return next(new AppError("Access Token is Invalid.", 400));
            }
        }
    }
}
)

module.exports = authMiddleware;
