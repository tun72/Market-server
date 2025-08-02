const express = require("express");
const router = express.Router();
const { body } = require('express-validator');
const eventController = require("../../../controllers/admin/eventController");
const sellerController = require("../../../controllers/admin/sellerController");
const eventMiddleware = require("../../../middlewares/eventMiddleware");

const adController = require("../../../controllers/admin/adController");
const typeController = require("../../../controllers/admin/typeController");



const handleErrorMessage = require("../../../middlewares/handelErrorMessage");
const upload = require("../../../middlewares/uploadFile");


// seller
router.route("/sellers")
    .get(sellerController.getAllSellers)
    .post(
        upload.fields([
            { name: "NRCFront", maxCount: 1 },
            { name: "NRCBack", maxCount: 1 },
            { name: "logo", maxCount: 1 }
        ]),
        sellerController.createSeller
    )
router.get("/sellers/:id", sellerController.getSellerById)

router.patch("/sellers", upload.fields([
    { name: "NRCFront", maxCount: 1 },
    { name: "NRCBack", maxCount: 1 },
    { name: "logo", maxCount: 1 }
]), sellerController.updateSeller)
// router.delete("/sellers/:id", sellerController.deleteSeller)


// events
router.route("/events")
    .get(eventController.getAllEvents)
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
        eventController.createEvent
    )

router.route("/events/:id").put(
    eventMiddleware.isEventExit,
    eventMiddleware.uploadImage,
    eventMiddleware.resizeImage,
    eventMiddleware.updateImage,
    eventController.updateEvent)
    .delete(eventController.deleteEvent)


// ads

router.route("/ads").get(adController.getAllAds).
    post(upload.fields([
        { name: "image", maxCount: 1 }
    ]), adController.createAd)
    .patch(upload.fields([
        { name: "image", maxCount: 1 }
    ]), adController.updateAd).delete(adController.deleteAd)

// types
router.route("/types").get(typeController.getAllTypes).
    post(upload.fields([
        { name: "image", maxCount: 1 }
    ]), typeController.createType)
    .patch(upload.fields([
        { name: "image", maxCount: 1 }
    ]), typeController.updateType).delete(typeController.deleteType)




module.exports = router;
