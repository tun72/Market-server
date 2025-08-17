const express = require("express")
// const productRoute = require("./admin/")
const authRoute = require("./authRoute");
const mesageRoute = require("./messageRoute")
const adminRoute = require("./admin/index")
const sellerRoute = require("./seller/index")
const userRoute = require("./api/index");
const authorise = require("../../middlewares/authoriseMiddleware");
const authMiddleware = require("../../middlewares/authMiddleware");

const router = express.Router()

// const categoryRoute = require("./routes/categoryRoutes")
// routes
// app.use("/api/v1/products", productRoute);
router.use("/api/v1/auth", authRoute);

router.use("/api/v1/seller", authMiddleware, authorise(true, "seller"), sellerRoute);
// router.use("/api/v1/categories", categoryRoute);

router.use("/api/v1/admin", authMiddleware, authorise(true, "admin"), adminRoute);

router.use("/api/v1/user", userRoute)

router.use("/api/v1/message", authMiddleware, mesageRoute)

module.exports = router