const express = require("express");
const router = express.Router();
const eventController = require("../../../controllers/seller/eventController");
const productController = require("../../../controllers/seller/productController");
const orderController = require("../../../controllers/seller/orderController");
const dashboardController = require("../../../controllers/seller/dashboardController");
const paymentController = require("../../../controllers/seller/paymentController");



const upload = require("../../../middlewares/uploadFile");


// const upload = require("../utils/upload");

// events
router.get("/events", eventController.getAllEvents)
router.post("/events/join", eventController.joinEvent)
router.post("/events/discount-produects", eventController.addDiscount)
router.get("/events/:id", eventController.getEventById)
router.get("/participants/:id", eventController.getParticipant)


// products
router.get("/products", productController.getAllProducts)

router.post("/products", upload.array("images"), productController.createProduct)
router.patch("/products", upload.array("images"), productController.updateProduct)
router.delete("/products", productController.deleteProduct)

router.delete("/products/images:delete", productController.deleteImage)


router.get("/products/:id", productController.getProductById)



// router.get("/:id", productController.getProductById);
router.get("/orders", orderController.getAllOrders)
router.patch("/orders/update", orderController.updateOrders)

// dashboard
router.get("/status", dashboardController.getStatus)

//payment hostory
router.get("/payment-history", paymentController.getAllPaymentHistory)

router.route("/payments").get(paymentController.getPaymentMethod).
    post(upload.fields([
        { name: "QR", maxCount: 1 }
    ]), paymentController.createPaymentMethod)
    .patch(upload.fields([
        { name: "QR", maxCount: 1 }
    ]), paymentController.updatePaymentMethod).delete(paymentController.deletePaymentMethod)

router.get("/payments/:id", paymentController.getPaymentMethodById)


module.exports = router