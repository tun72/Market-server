const express = require("express");

const router = express.Router();

const messageController = require("../../controllers/messageController");


router.get("/admin", messageController.getAdminId)

router.post("/", [
    messageController.aliasMessages,
    messageController.getAllMessages
])

router.get("/dm", messageController.getContactForDMList)

module.exports = router
