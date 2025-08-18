const express = require("express");
const router = express.Router();
const productController = require("../../../controllers/api/productController")
const cartController = require("../../../controllers/api/cartContoller");
const orderController = require("../../../controllers/api/orderController");
const adsController = require("../../../controllers/api/adsController");
const merchantController = require("../../../controllers/api/merchantController");
const authMiddleware = require("../../../middlewares/authMiddleware");
const authorise = require("../../../middlewares/authoriseMiddleware");
const TrainingConfig = require("../../../models/trainingConfig");
const ModelTrainer = require("../../../tensorflow/ModelTrainer");
const FeatureExtractor = require("../../../tensorflow/FeatureExtractor");
const { Product } = require("../../../models/productModel");


//events
router.get("/events", productController.getAllEvents)

// products
router.get("/products/featured", productController.getFeaturedProducts)
// router.get("/related-products/:productId", productController.getRelatedProduct)
router.get("/products", productController.getAllProducts)
router.get("/products/search", productController.searchQueryProducts)
router.get("/products/:id", productController.getProductById)

// types
router.get("/popular-types", productController.getPopularTypes)
router.get("/types", productController.getAllTypes)
router.get("/categories", productController.getAllCategories)
router.get("/categories/:id", productController.getCategories)

//merchants
router.get("/merchants", merchantController.getAllMerchants)
router.get("/merchants/:id", merchantController.getMerchantById)

router.get("/ads", adsController.getAllAds)


// order
router.use(authMiddleware, authorise(true, "customer"))
router.post("/cart", cartController.addToCart)
router.delete("/cart", cartController.deleteCart)
router.get("/cart", cartController.getCart)
router.patch("/cart", cartController.updateCart)

// shipping
router.get("/shipping", cartController.getCart)


//order
router.post("/order", orderController.createOrder)

// checkout
router.post("/create-checkout-session", orderController.createCheckoutSession);

router.post("/checkout-success", orderController.checkoutSuccess);

router.post("/cash-on-delivery", orderController.cashOnDelivery);

router.get("/orders", orderController.getOrders)
router.get("/orders/:code", orderController.getOrderByCode)



// routes/yourRouteFile.js

router.post('/model/train', async (req, res) => {
    try {
        const {
            architecture = 'mobilenet_custom',
            learningRate = 0.001,
            batchSize = 32,
            epochs = 50,
            validationSplit = 0.2
        } = req.body;

        console.log('Starting model training...');

        // Get all products from database
        const products = await Product.find({
            images: { $exists: true, $ne: [] }
        });

        if (products.length < 10) {
            return res.status(400).json({
                error: 'Need at least 10 products to train model effectively'
            });
        }

        // Create new training configuration
        const modelVersion = `v${Date.now()}`;
        const trainingConfig = new TrainingConfig({
            modelVersion,
            architecture,
            hyperparameters: {
                learningRate,
                batchSize,
                epochs,
                validationSplit
            },
            // FIX: Ensure the model path is constructed correctly
            modelPath: `trained_models/product_model_${modelVersion}/model.json`
        });

        await trainingConfig.save();

        // Initialize model trainer
        const modelTrainer = new ModelTrainer({
            // FIX: You MUST provide the path to your images folder here.
            imagesBasePath: 'uploads/images',

            architecture,
            learningRate,
            batchSize,
            epochs,
            validationSplit,
            modelVersion
        });

        // Start training in background
        setImmediate(async () => {
            try {
                // The `products` object from Mongoose is an array of documents, which is correct.
                const trainingResults = await modelTrainer.trainWithProducts(products);

                // Update training config with results
                trainingConfig.trainingMetrics = trainingResults.metrics;
                trainingConfig.status = 'completed';
                await trainingConfig.save();

                // Load the trained model
                currentModel = trainingResults.model;
                const featureExtractor = new FeatureExtractor(currentModel);

                console.log('Model training completed successfully');
            } catch (error) {
                console.error('Background training process failed:', error);
                trainingConfig.status = 'failed';
                await trainingConfig.save();
            }
        });

        res.json({
            message: 'Model training started successfully in the background.',
            modelVersion,
            trainingConfigId: trainingConfig._id,
            productsCount: products.length
            // Note: It's generally not a good idea to send the full products array back in the response
            // as it can be very large. The count is usually sufficient.
        });

    } catch (error) {
        console.error('Error starting training:', error);
        res.status(500).json({ error: 'Error starting model training' });
    }
});


router.post('/api/search', async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided' });
        }

        if (!currentModel || !featureExtractor) {
            return res.status(400).json({ error: 'No trained model available. Please train model first.' });
        }

        // Extract features from search image
        const searchFeatures = await FeatureExtractor.extractFeatures(req.file.path);

        // Get products with features
        const products = await Product.find({ features: { $exists: true, $ne: [] } });

        if (products.length === 0) {
            return res.status(400).json({ error: 'No products with extracted features. Run feature extraction first.' });
        }

        // Calculate similarities using custom distance metric
        const similarities = products.map(product => ({
            product: {
                _id: product._id,
                name: product.name,
                description: product.description,
                category: product.category,
                price: product.price,
                imageUrl: product.imageUrl
            },
            similarity: calculateAdvancedSimilarity(searchFeatures, product.features)
        }));

        // Sort by similarity and get top results
        const results = similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, parseInt(req.query.limit) || 20);

        // Clean up search image
        fs.unlinkSync(req.file.path);

        res.json({
            results,
            searchFeatures: searchFeatures.slice(0, 10), // Return first 10 features for debugging
            totalProducts: products.length
        });

    } catch (error) {
        console.error('Error in image search:', error);
        res.status(500).json({ error: 'Error searching products' });
    }
});


module.exports = router