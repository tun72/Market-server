const express = require("express");

const router = express.Router();

const authController = require("../../controllers/authController");

const passport = require("passport");
const session = require("express-session");
const Customer = require("../../models/customerModel");
const { generateRandToken } = require("../../utils/generateToken");
const OAuth2Strategy = require("passport-google-oauth2").Strategy;


router.post("/signin/merchant", authController.merchantSignIn)

router.post("/signin/admin-merchant", authController.adminSignIn)

router.post("/signin", authController.signIn);
router.post("/signup", authController.signUp);



// router.use(
//     session({
//         secret: process.env.SECRET_KEY,
//         resave: false,
//         saveUninitialized: true,
//     })
// );


// router.use(passport.initialize());
// router.use(passport.session());

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
    "/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
    "/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    (req, res, next) => {
        // `req.user` should be available after authentication
        const user = req.user;

        if (!user) {
            return res.status(400).json({ message: "Authentication failed" });
        }


        res.redirect(process.env.FRONTEND + "/user");
    }
);

module.exports = router;
