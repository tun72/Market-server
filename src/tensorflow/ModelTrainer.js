const tf = require('@tensorflow/tfjs-node');

const fs = require('fs').promises;
const path = require('path');
const ImageProcessor = require('./ImageProcessor');

class ModelTrainer {
    constructor(config = {}) {
        this.config = {
            architecture: config.architecture || 'custom_cnn',
            learningRate: config.learningRate || 0.001,
            batchSize: config.batchSize || 16,
            epochs: config.epochs || 30,
            validationSplit: config.validationSplit || 0.2,
            modelVersion: config.modelVersion || 'v1.0',
            imageSize: config.imageSize || 224,
            featureSize: config.featureSize || 512
        };

        this.imageProcessor = new ImageProcessor();
        this.model = null;
        this.trainingHistory = {
            loss: [],
            accuracy: [],
            valLoss: [],
            valAccuracy: []
        };
    }

    // Create custom CNN architecture
    createCustomModel() {
        console.log('🏗️  Building custom CNN architecture...');

        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.inputLayer({
            inputShape: [this.config.imageSize, this.config.imageSize, 3]
        }));

        // Feature extraction layers
        model.add(tf.layers.conv2d({
            filters: 32,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
        model.add(tf.layers.dropout({ rate: 0.25 }));

        model.add(tf.layers.conv2d({
            filters: 64,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
        model.add(tf.layers.dropout({ rate: 0.25 }));

        model.add(tf.layers.conv2d({
            filters: 128,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
        model.add(tf.layers.dropout({ rate: 0.25 }));

        model.add(tf.layers.conv2d({
            filters: 256,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));
        model.add(tf.layers.batchNormalization());

        // Replace globalAveragePooling2d with explicit configuration
        model.add(tf.layers.globalAveragePooling2d({
            dataFormat: 'channelsLast'
        }));

        // Feature dense layers
        model.add(tf.layers.dense({
            units: this.config.featureSize,
            activation: 'relu',
            name: 'feature_layer'
        }));
        model.add(tf.layers.dropout({ rate: 0.5 }));

        // Output layer for similarity learning
        model.add(tf.layers.dense({
            units: this.config.featureSize,
            activation: 'linear',
            name: 'embedding_layer'
        }));

        // Compile model
        model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'meanSquaredError',
            metrics: ['accuracy']
        });

        console.log('✅ Model architecture created');
        model.summary();

        return model;
    }

    // Alternative: Replace with flatten + reshape if globalAveragePooling2d continues to cause issues
    createAlternativeModel() {
        console.log('🏗️  Building alternative CNN architecture...');

        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.inputLayer({
            inputShape: [this.config.imageSize, this.config.imageSize, 3]
        }));

        // Feature extraction layers
        model.add(tf.layers.conv2d({
            filters: 32,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
        model.add(tf.layers.dropout({ rate: 0.25 }));

        model.add(tf.layers.conv2d({
            filters: 64,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
        model.add(tf.layers.dropout({ rate: 0.25 }));

        model.add(tf.layers.conv2d({
            filters: 128,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));
        model.add(tf.layers.batchNormalization());
        model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
        model.add(tf.layers.dropout({ rate: 0.25 }));

        model.add(tf.layers.conv2d({
            filters: 256,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));
        model.add(tf.layers.batchNormalization());

        // Use flatten instead of globalAveragePooling2d as fallback
        model.add(tf.layers.flatten());

        // Feature dense layers
        model.add(tf.layers.dense({
            units: this.config.featureSize,
            activation: 'relu',
            name: 'feature_layer'
        }));
        model.add(tf.layers.dropout({ rate: 0.5 }));

        // Output layer for similarity learning
        model.add(tf.layers.dense({
            units: this.config.featureSize,
            activation: 'linear',
            name: 'embedding_layer'
        }));

        // Compile model
        model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'meanSquaredError',
            metrics: ['accuracy']
        });

        console.log('✅ Alternative model architecture created');
        model.summary();

        return model;
    }

    // Prepare training data from products
    async prepareTrainingData(products) {
        console.log('📊 Preparing training data...');

        const images = [];
        const labels = [];
        const categories = [...new Set(products.map(p => p.category))];
        const categoryMap = {};
        categories.forEach((cat, idx) => categoryMap[cat] = idx);

        for (let i = 0; i < products.length - 1; i++) {
            const product = products[i];

            // if (!product.images[0] || !await this.fileExists(product.imagePath)) {
            //     console.warn(`⚠️  Image not found for product: ${product.name}`);
            //     continue;
            // }

            try {
                const imageData = await this.imageProcessor.loadAndPreprocess(__dirname + "/../../uploads/images/" + product.images[0], this.config.imageSize);
                console.log(imageData);

                images.push(imageData);

                // Create one-hot encoded category label
                const categoryLabel = tf.oneHot(categoryMap[product.category], categories.length);
                labels.push(categoryLabel);

            } catch (error) {
                console.warn(`⚠️  Error processing image for ${product.name}:`, error.message);
            }
        }

        if (images.length === 0) {
            throw new Error('No valid images found for training');
        }

        // Stack tensors
        const imageTensor = tf.stack(images);
        const labelTensor = tf.stack(labels);

        // Clean up individual tensors
        images.forEach(img => img.dispose());
        labels.forEach(label => label.dispose());

        console.log(`✅ Training data prepared: ${images.length} samples`);

        return {
            images: imageTensor,
            labels: labelTensor,
            categoryMap,
            sampleCount: images.length
        };
    }

    // Main training function with fallback mechanism
    async trainWithProducts(products) {
        console.log('🎯 Starting custom model training...');

        try {
            // Try to create model with globalAveragePooling2d first
            try {
                this.model = this.createCustomModel();
            } catch (poolingError) {
                console.warn('⚠️  GlobalAveragePooling2d failed, using alternative architecture...');
                this.model = this.createAlternativeModel();
            }

            // Prepare training data
            const trainingData = await this.prepareTrainingData(products);

            if (trainingData.sampleCount < 5) {
                throw new Error('Not enough valid samples for training');
            }

            // // Split data for validation
            // const splitIndex = Math.floor(trainingData.sampleCount * (1 - this.config.validationSplit));

            // const trainImages = trainingData.images.slice([0], [splitIndex]);
            // const trainLabels = trainingData.labels.slice([0], [splitIndex]);
            // const valImages = trainingData.images.slice([splitIndex]);
            // const valLabels = trainingData.labels.slice([splitIndex]);

            // console.log(`📈 Training samples: ${splitIndex}, Validation samples: ${trainingData.sampleCount - splitIndex}`);

            // // Custom training loop with callbacks
            // const history = await this.model.fit(trainImages, trainLabels, {
            //     epochs: this.config.epochs,
            //     batchSize: this.config.batchSize,
            //     validationData: [valImages, valLabels],
            //     shuffle: true,
            //     callbacks: {
            //         onEpochEnd: (epoch, logs) => {
            //             console.log(`Epoch ${epoch + 1}/${this.config.epochs} - Loss: ${logs.loss.toFixed(4)}, Val Loss: ${logs.val_loss.toFixed(4)}`);

            //             this.trainingHistory.loss.push(logs.loss);
            //             this.trainingHistory.valLoss.push(logs.val_loss);
            //             if (logs.accuracy) this.trainingHistory.accuracy.push(logs.accuracy);
            //             if (logs.val_accuracy) this.trainingHistory.valAccuracy.push(logs.val_accuracy);
            //         }
            //     }
            // });

            // // Create directory if it doesn't exist
            // const modelDir = path.resolve('trained_models');
            // try {
            //     await fs.mkdir(modelDir, { recursive: true });
            // } catch (dirError) {
            //     // Directory might already exist, continue
            // }

            // // Save trained model
            // const modelPath = `trained_models/product_model_${this.config.modelVersion}`;
            // await this.model.save(`file://${path.resolve(modelPath)}`);

            // // Clean up tensors
            // trainingData.images.dispose();
            // trainingData.labels.dispose();
            // trainImages.dispose();
            // trainLabels.dispose();
            // valImages.dispose();
            // valLabels.dispose();

            // console.log('✅ Model training completed and saved');

            // return {
            //     model: this.model,
            //     metrics: this.trainingHistory,
            //     categoryMap: trainingData.categoryMap,
            //     modelPath: modelPath + '.json'
            // };

        } catch (error) {
            console.error('❌ Training failed:', error);
            throw error;
        }
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = ModelTrainer;