const express = require("express");
const router = express.Router();
const productController = require("../../../controllers/api/productController")
// const authMiddleware = require("../middlewares/authMiddleware");

// router.use(authMiddleware)

// router.get("/events", sellerController.getAllEvents)

// router.post("/events/join", sellerController.joinEvent)
// router.post("/events/discount-produects", sellerController.addDiscount)

// router.get("/events/:id", sellerController.getEventById)

// router.get("/participants/:id", sellerController.getParticipant)


// products

router.get("/products", productController.getAllProducts)

router.route("/products/:id")
    .get(productController.getProductById)
    .put(productController.updateProduct)
    .delete(productController.removeProduct)



module.exports = router