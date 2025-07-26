const express = require("express");
const router = express.Router();
const eventController = require("../../../controllers/seller/eventController");
const productController = require("../../../controllers/seller/productController");
const orderController = require("../../../controllers/seller/orderController");

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




// router.get("/:id", productController.getProductById);
router.get("/orders", orderController.getAllOrders)



module.exports = router