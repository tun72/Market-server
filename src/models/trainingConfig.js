const mongoose = require("mongoose");
const trainingConfigSchema = new mongoose.Schema({
    modelVersion: { type: String, required: true },
    architecture: String,
    hyperparameters: {
        learningRate: Number,
        batchSize: Number,
        epochs: Number,
        validationSplit: Number
    },
    trainingMetrics: {
        loss: [Number],
        accuracy: [Number],
        valLoss: [Number],
        valAccuracy: [Number]
    },
    trainedAt: { type: Date, default: Date.now },
    modelPath: String,
    status: { type: String, enum: ['training', 'completed', 'failed'], default: 'training' }
});

const TrainingConfig = mongoose.model('TrainingConfig', trainingConfigSchema);

module.exports = TrainingConfig