// Upload Session Schema for tracking
const mongoose = require("mongoose");
const uploadSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    filename: String,
    totalRecords: { type: Number, default: 0 },
    processedRecords: { type: Number, default: 0 },
    successfulRecords: { type: Number, default: 0 },
    failedRecords: { type: Number, default: 0 },
    status: { type: String, enum: ['processing', 'completed', 'error'], default: 'processing' },
    errors: [{
        line: Number,
        record: Object,
        error: String
    }],
    startTime: { type: Date, default: Date.now },
    endTime: Date,
    createdBy: String // Add user ID if you have authentication
});

const UploadSession = mongoose.model('UploadSession', uploadSessionSchema);

module.exports = UploadSession