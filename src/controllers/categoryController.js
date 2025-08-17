const { Category } = require("../models/productModel.js");

const getAllCategoriesController = async (_, res) => {
  const categories = await Category.find();

  if (!categories)
    return res.status(404).json({ message: "There have no data" });

  return res
    .status(200)
    .json({ message: "Get All Categories Successfully!", data: categories, isSuccess: true });
};

const createCategoriesController = async (req, res) => {
  const { name, parent, isActive } = req.body;
  try {
    const category = await Category.create({
      name: name,
      parent: parent || null,
      isActive: isActive,
    });

    return res
      .status(201)
      .json({ message: "Category created successfully", category: category, isSuccess: true });
  } catch (ex) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const updateCategoriesController = async (req, res) => {
  const { id } = req.params;
  const { name, parent, isActive } = req.body;
  try {
    const existCategories = await Category.findById(id);

    if (!existCategories)
      return res
        .status(400)
        .json({ message: "There is no category with this id" });

    existCategories.name = name;
    existCategories.parent = parent;
    existCategories.isActive = isActive;

    await existCategories.save();
    return res.status(201).json({ message: "Category updated successfully" });
  } catch (ex) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const deleteCategoriesController = async (req, res) => {
  const { id } = req.params;
  try {
    const existCategories = await Category.findById(id);

    if (!existCategories)
      return res
        .status(400)
        .json({ message: "There is no category with this id" });

    await existCategories.deleteOne();
    return res.status(201).json({ message: "Category deleted successfully" });
  } catch (ex) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ Export all controllers as an object
module.exports = {
  getAllCategoriesController,
  createCategoriesController,
  updateCategoriesController,
  deleteCategoriesController,
};
