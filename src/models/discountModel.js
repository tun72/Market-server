const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const discProductSchema = new Schema({
    value: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
})

// Virtual populate
// discProductSchema.virtual('products', {
//     ref: 'Product',
//     foreignField: 'productId',
//     localField: '_id'
// });
module.exports = model("Discount", discProductSchema)


