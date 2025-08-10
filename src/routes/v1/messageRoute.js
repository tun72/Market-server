const express = require("express");

const router = express.Router();

const messageController = require("../../controllers/messageController");

router.post("/", [
    messageController.aliasMessages,
    messageController.getAllMessages
])

module.exports = router
