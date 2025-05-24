const express = require("express");
const router = express.Router();
const sellerController = require("../../../controllers/seller/sellerController");
const authMiddleware = require("../../../middlewares/authMiddleware");

const productController = require("../../../controllers/seller/productController");
const upload = require("../../../middlewares/uploadFile");

// const upload = require("../utils/upload");

// router.use(authMiddleware)

router.get("/events", sellerController.getAllEvents)

router.post("/events/join", sellerController.joinEvent)
router.post("/events/discount-produects", sellerController.addDiscount)

router.get("/events/:id", sellerController.getEventById)

router.get("/participants/:id", sellerController.getParticipant)




// product
// router.route("/products")
//     .get(productController.getAllProducts)

router.get("/products", productController.getAllProducts)
router.post("/products", upload.array("images"), productController.createProduct)
router.patch("/products", upload.array("images"), productController.updateProduct)
router.delete("/products", productController.deleteProduct)



// router.get("/:id", productController.getProductById);



module.exports = router