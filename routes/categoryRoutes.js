const express = require("express");
const {
  getAllCategoriesController,
  createCategoriesController,
  updateCategoriesController,
  deleteCategoriesController,
} = require("../controllers/categoryController.js");

const router = express.Router();

router.get("/", getAllCategoriesController);

router.post("/", createCategoriesController);

router.patch("/:id", updateCategoriesController);

router.delete("/:id", deleteCategoriesController);

module.exports = router;
