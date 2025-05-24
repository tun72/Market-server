const express = require("express")
// const productRoute = require("./admin/")
const authRoute = require("./authRoute");
const adminRoute = require("./admin/index")
const sellerRoute = require("./seller/index")
const userRoute = require("./api/index")

const router = express.Router()

// const categoryRoute = require("./routes/categoryRoutes")
// routes
// app.use("/api/v1/products", productRoute);
router.use("/api/v1/auth", authRoute);

router.use("/api/v1/seller", sellerRoute);
// router.use("/api/v1/categories", categoryRoute);

router.use("/api/v1/admin", adminRoute);

router.use("/api/v1/user", userRoute)

module.exports = router