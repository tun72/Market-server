const express = require("express");
const router = express.Router();
const productController = require("../../../controllers/api/productController")
const cartController = require("../../../controllers/api/cartContoller");
const orderController = require("../../../controllers/api/orderController");
const adsController = require("../../../controllers/api/adsController");
const merchantController = require("../../../controllers/api/merchantController");
const customerController = require("../../../controllers/api/customerController");

const authMiddleware = require("../../../middlewares/authMiddleware");
const authorise = require("../../../middlewares/authoriseMiddleware");
const upload = require("../../../middlewares/uploadFile");

//events
router.get("/events", productController.getAllEvents)

// products
router.get("/products/featured", productController.getFeaturedProducts)
// router.get("/related-products/:productId", productController.getRelatedProduct)
router.get("/products", productController.getAllProducts)
router.get("/products/search", productController.searchQueryProducts)
router.get("/products/:id", productController.getProductById)

// types
router.get("/popular-types", productController.getPopularTypes)
router.get("/types", productController.getAllTypes)
router.get("/categories", productController.getAllCategories)
router.get("/categories/:id", productController.getCategories)

//merchants
router.get("/merchants", merchantController.getAllMerchants)
router.get("/merchants/:id", merchantController.getMerchantById)

router.get("/ads", adsController.getAllAds)


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

router.post("/cash-on-delivery", orderController.cashOnDelivery);

router.get("/orders", orderController.getOrders)
router.get("/orders/:code", orderController.getOrderByCode)

router.get('/profile/:id', customerController.getCustomerProfile);
router.patch('/profile/:id', upload.fields([
    { name: "image", maxCount: 1 },
]), customerController.updateCustomerProfile);
router.patch('/profile/:id/shipping', customerController.updateShippingAddress);



module.exports = router