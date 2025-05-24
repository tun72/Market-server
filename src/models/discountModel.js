const { Schema, model } = require('mongoose');
const discProductSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    discPercent: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
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