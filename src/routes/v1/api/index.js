const express = require("express");
const router = express.Router();
const productController = require("../../../controllers/api/productController")
const cartController = require("../../../controllers/api/cartContoller");
const orderController = require("../../../controllers/api/orderController");

const merchantController = require("../../../controllers/api/merchantController");


const authMiddleware = require("../../../middlewares/authMiddleware");
const authorise = require("../../../middlewares/authoriseMiddleware");

// const authMiddleware = require("../middlewares/authMiddleware");

// router.use(authMiddleware)

// router.get("/events", sellerController.getAllEvents)

// router.post("/events/join", sellerController.joinEvent)
// router.post("/events/discount-produects", sellerController.addDiscount)

// router.get("/events/:id", sellerController.getEventById)

// router.get("/participants/:id", sellerController.getParticipant)

//events
// router.get("/m")

// products
router.get("/products", productController.getAllProducts)
router.get("/products/:id", productController.getProductById)
router.get("/types", productController.getAllTypes)
router.get("/categories/:id", productController.getCategories)
router.get("/merchants", merchantController.getAllMerchants)
router.get("/merchants/:id", merchantController.getMerchantById)


// order
router.use(authMiddleware, authorise(true, "customer"))
router.post("/cart", cartController.addToCart)
router.delete("/cart", cartController.deleteCart)
router.get("/cart", cartController.getCart)
router.patch("/cart", cartController.updateCart)

// shipping
router.get("/shipping", cartController.getCart)


//order
router.post("/order", orderController.createOrder)

// checkout
router.post("/create-checkout-session", orderController.createCheckoutSession);
router.post("/checkout-success", orderController.checkoutSuccess);





module.exports = router