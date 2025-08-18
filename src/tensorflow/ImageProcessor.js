const tf = require('@tensorflow/tfjs-node-gpu');
const sharp = require('sharp');
const fs = require('fs').promises;

class ImageProcessor {
    async loadAndPreprocess(imagePath, targetSize = 224) {
        try {
            const imageBuffer = await fs.readFile("/Applications/school_project/Ayeyar_Market/Market-server/uploads/images/1755181236348-39251447.png");

            const { data, info } = await sharp(imageBuffer)
                .resize(targetSize, targetSize, { kernel: 'linear' }) // Bilinear interpolation
                .removeAlpha() // Remove transparency channel (ensures 3 channels)
                .raw() // Get raw pixel data
                .toBuffer({ resolveWithObject: true });

            // Create and normalize tensor
            return tf.tidy(() => {
                const tensor = tf.tensor3d(data, [info.height, info.width, info.channels]);
                return tensor.div(255.0); // Normalize to [0, 1]
            });

        } catch (error) {
            console.error(`Error processing image ${imagePath}:`, error);
            throw new Error(`Image processing failed: ${error.message}`);
        }
    }
}

module.exports = ImageProcessor;
