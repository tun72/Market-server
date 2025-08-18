const tf = require('@tensorflow/tfjs-node');
const ImageProcessor = require('./ImageProcessor');


class FeatureExtractor {
    constructor(model = null) {
        this.model = model;
        this.imageProcessor = new ImageProcessor();
    }

    setModel(model) {
        this.model = model;
    }

    async extractFeatures(imagePath) {
        if (!this.model) {
            throw new Error('No model loaded for feature extraction');
        }

        try {
            // Load and preprocess image
            const imageData = await this.imageProcessor.loadAndPreprocess(imagePath, 224);

            // Get features from embedding layer
            const embeddings = this.model.predict(imageData.expandDims(0));
            const featuresArray = await embeddings.data();

            // Clean up tensors
            imageData.dispose();
            embeddings.dispose();

            return Array.from(featuresArray);

        } catch (error) {
            console.error('Error extracting features:', error);
            throw error;
        }
    }

    // Extract features for multiple images (batch processing)
    async extractFeaturesFromBatch(imagePaths) {
        const results = [];

        for (const imagePath of imagePaths) {
            try {
                const features = await this.extractFeatures(imagePath);
                results.push({ imagePath, features, success: true });
            } catch (error) {
                results.push({ imagePath, error: error.message, success: false });
            }
        }

        return results;
    }
}

module.exports = FeatureExtractor;