const express = require("express");
const router = express.Router();
const sellerController = require("../controllers/sellerController")

router.get("/events", sellerController.getAllEvents)
router.get("/events/:id", sellerController.getEventById)
