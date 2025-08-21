const express = require("express");

const router = express.Router();

const authController = require("../../controllers/authController");

const passport = require("passport");
const session = require("express-session");

router.post("/signin/merchant", authController.merchantSignIn)

router.post("/signin/admin-merchant", authController.adminSignIn)

router.post("/signin", authController.signIn);
router.post("/signup", authController.signUp);
const Customer = require("../../models/customerModel");
const { generateAccessToken, generateRandToken } = require("../../utils/generateToken");
const { encrypt } = require("../../utils/encryptData");
const OAuth2Strategy = require("passport-google-oauth2").Strategy;



router.use(
    session({
        secret: process.env.SECRET_KEY,
        resave: false,
        saveUninitialized: false,
    })
);


router.use(passport.initialize());
router.use(passport.session());


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
                    const randPassword = profile.id + Math.random(1e6)
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
                return done(error, null);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});




router.get(
    "/google", authController.LoginWithGoogle
);

router.get(
    "/google/callback", passport.authenticate("google", { failureRedirect: "/login" }),
    async (req, res, next) => {
        const user = req.user;

        if (!user) {
            return res.status(400).json({ message: "Authentication failed" });
        }

        const accessToken = await generateAccessToken({ id: user.id });

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
        }

        const encryptData = await encrypt(data);
        res.redirect(process.env.FRONTEND_URL + "/login?token=" + encodeURIComponent(encryptData.encryptedData));
    }
);

module.exports = router;
