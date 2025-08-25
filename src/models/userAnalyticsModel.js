const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema.Types;

const analyticSchema = new mongoose.Schema({
    status: { type: String, enum: ['search', 'purchase', 'view', "order"], required: true },
    product: { type: ObjectId, ref: "Product", required: true },
    user: { type: ObjectId, ref: "User", required: true },
    category: {
        type: ObjectId,
        ref: 'Category',
        required: true
    }
}, {
    timestamps: true,
});

const Analytic = mongoose.model('Analytic', analyticSchema);

module.exports = Analytic