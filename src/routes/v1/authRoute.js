const express = require("express");

const router = express.Router();

const authController = require("../../controllers/authController");

router.post("/signin/merchant", authController.merchantSignIn)
router.post("/signin/admin", authController.adminSignIn)

router.post("/signin", authController.signIn);
router.post("/signup", authController.signUp);

module.exports = router;
