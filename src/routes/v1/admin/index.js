const express = require("express");
const router = express.Router();
const { body } = require('express-validator');
const adminController = require("../../../controllers/admin/adminController");

const productController = require("../../../controllers/admin/productController");

// Middlewares
const sellerMiddleware = require("../../../middlewares/sellerMiddleware")
const eventMiddleware = require("../../../middlewares/eventMiddleware");
const handleErrorMessage = require("../../../middlewares/handelErrorMessage");


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

router.get("/products", productController.getAllProducts)

// router.patch("/products/update-status/:id", productController.updateStatus)


router.route("/products/:id")
    .get(productController.getProductById)
    .put(productController.updateProduct)
    .delete(productController.removeProduct)


// events

router.route("/events")
    .get(adminController.getAllEvents)
    .post(
        eventMiddleware.uploadImage,
        [
            body('name').notEmpty().withMessage('Name is required'),
            body('type').notEmpty().withMessage('Type is required'),
            body('startDate').toDate().notEmpty().withMessage("Start Date is required"),
            body('endDate').toDate().notEmpty().withMessage("End Date is required"),
        ],
        handleErrorMessage,
        eventMiddleware.sendEventNotification,
        eventMiddleware.resizeImage,
        adminController.createEvent
    )

router.route("/events/:id").put(
    eventMiddleware.isEventExit,
    eventMiddleware.uploadImage,
    eventMiddleware.resizeImage,
    eventMiddleware.updateImage,
    adminController.updateEvent)
    .delete(adminController.deleteEvent)



module.exports = router;
