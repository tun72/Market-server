const express = require("express");

const router = express.Router();

const adminController = require("../controllers/adminController");


// Middlewares
const sellerMiddleware = require("../middlewares/sellerMiddleware")

// get routes (businedd type)
// router.post("/signin", authController.signIn);
// router.post("/signup", authController.signUp);


// seller

router.route("/sellers")
    .get(adminController.getAllSellers)
    .post(
        sellerMiddleware.uploadImage,
        sellerMiddleware.resizeImage,
        adminController.createSeller
    )


router.get("/sellers/:id", adminController.getSellerById)
router.patch("/sellers/:id",
    sellerMiddleware.isSellerExist,
    sellerMiddleware.uploadImage,
    sellerMiddleware.resizeImage,
    sellerMiddleware.updateImage,
    adminController.updateSeller)

router.delete("/sellers/:id", adminController.deleteSeller)


// products

router.get("/products", adminController.getAllProducts)

router.patch("/products/update-status/:id", adminController.updateStatus)


router.route("/products/:id")
    .get(adminController.getProductById)
    .put(adminController.updateProduct)
    .delete(adminController.removeProduct)



module.exports = router;
