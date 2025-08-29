const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const authController = require("../../controllers/authController");
const passport = require("passport");
const session = require("express-session");
const MongoStore = require("connect-mongo"); // Add this dependency
const Customer = require("../../models/customerModel");
const { generateAccessToken, generateRandToken } = require("../../utils/generateToken");
const { encrypt } = require("../../utils/encryptData");
const OAuth2Strategy = require("passport-google-oauth2").Strategy;
const dotenv = require("dotenv")
dotenv.config()

// Basic auth routes
router.post("/signin/merchant", authController.merchantSignIn);
router.post("/signin/admin-merchant", authController.adminSignIn);
router.post("/signin", authController.signIn);
router.post("/signup", authController.signUp);

// Session configuration (move to app.js for better practice)
router.use(
    session({
        secret: process.env.SESSION_SECRET || process.env.SECRET_KEY,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGODB_URL,
            touchAfter: 24 * 3600 // lazy session update
        }),
        cookie: {
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            httpOnly: true, // Prevent XSS
            maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
        }
    })
);

router.use(passport.initialize());
router.use(passport.session());

// Google OAuth Strategy
passport.use(
    new OAuth2Strategy(
        {
            clientID: process.env.CLIENTID,
            clientSecret: process.env.CLIENTSECRET,
            callbackURL: process.env.CALLBACK,
            scope: ["profile", "email"],
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                let user = await Customer.findOne({ email: profile.emails[0].value });

                if (!user) {
                    // Generate a secure random password
                    const randPassword = crypto.randomBytes(32).toString('hex');

                    user = new Customer({
                        name: profile.displayName,
                        password: randPassword,
                        passwordConfirm: randPassword,
                        email: profile.emails[0].value,
                        randToken: generateRandToken(),
                        image: profile.photos[0].value,
                        googleId: profile.id,
                    });
                } else {
                    if (!user.googleId) {
                        user.googleId = profile.id;
                    }
                }

                await user.save();
                return done(null, user);
            } catch (error) {
                console.error('OAuth authentication error:', error);
                return done(error, null);
            }
        }
    )
);

// Serialize only user ID for session storage efficiency
passport.serializeUser((user, done) => {
    done(null, user._id);
});

// Deserialize user from database
passport.deserializeUser(async (id, done) => {
    try {
        const user = await Customer.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Google OAuth routes
router.get("/google", authController.LoginWithGoogle);

router.get(
    "/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    async (req, res, next) => {
        try {
            const user = req.user;

            if (!user) {
                return res.status(400).json({ message: "Authentication failed" });
            }

            const accessToken = await generateAccessToken({ id: user._id });

            const data = {
                isSuccess: true,
                message: "Success",
                token: accessToken,
                data: {
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        role: user.role
                    }
                },
            };

            const encryptData = await encrypt(data);
            const redirectUrl = `${process.env.FRONTEND_URL}/login?token=${encodeURIComponent(encryptData.encryptedData)}`;

            res.redirect(redirectUrl);
        } catch (error) {
            console.error('Callback error:', error);
            res.redirect(`${process.env.FRONTEND_URL}/login?error=auth_failed`);
        }
    }
);

module.exports = router;