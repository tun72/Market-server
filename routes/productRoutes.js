const express = require("express");
const { Product, Brand, Category, Variation } = require("../models/productSchema");

const router = express.Router();

router.get("/", async (req, res) => {
    console.log("hit");

    const products = await Product.find().populate("variations")
    return res.send(products)

})

router.get("/create-one", async (req, res) => {
    const products = await Product.find()

    console.log("hit one");
    
    if (products.length !== 0) return res.send("Already Created")

    const brand = await Brand.create({ name: "Samsung" })

    const category = await Category({
        "name": "Electronics",
        "parent": null,
        "isActive": true,
    })

    const variations = await Variation.create({
        "color": "midnight black",
        "size": "M",
        "image": "https://example.com/images/phone-black.jpg",
        "offers": {
          "price": 799.99,
          "currency": "USD",
          "salePrice": 749.99,
          "priceValidUntil": "2027-12-31T23:59:59Z",
          "availability": "in-stock"
        },
        "stock": {
          "quantity": 150,
          "locations": "Yangon",
          "reorderThreshold": 20
        },
    
      })

    const product = await Product.create({
        "title": "Premium Smartphone X200",
        "description": "Flagship smartphone with advanced camera system",
        "sku": "SKU-X200-123",
        "brand": brand._id,
        "category": category._id,
        "images": [
            "https://example.com/images/phone1.jpg",
            "https://example.com/images/phone2.jpg"
        ],
        "variations": [variations._id],
        "shipping": {
            "weight": 0.2,
            "dimensions": {
                "length": 15,
                "width": 7.5,
                "height": 0.8,
                "unit": "cm"
            },
            "freeShipping": false,
            "shippingCost": 9.99
        },
        "aggregateRating": {
            "ratingValue": 4.5,
            "ratingCount": 150,
            "reviewCount": 120
        },
        "includes": ["Charger", "USB-C Cable"],
        "packaging": "eco-friendly",
        "warranty": {
            "duration": 12,
            "unit": "months"
        },
        "returns": {
            "policy": "refund",
            "period": 14
        },
        "tags": ["android", "5g", "128gb"],
        "meta": {
            "title": "Premium Smartphone X200 | Best Android Phone",
            "description": "Buy the latest Premium Smartphone X200 with advanced features"
        },
        "relatedProducts": [],
        "status": "active",
    })

    return res.send("success ")
})
module.exports = router 