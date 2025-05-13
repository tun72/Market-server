const { Schema, model } = require('mongoose');
const path = require('path');
const fileDelete = require('../utils/fileDelete');
const eventSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Event name is required'],
        trim: true
    },
    description: String,
    type: {
        type: String,
        required: true
    },
    poster: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['upcoming', 'active', 'expired'],
        default: 'upcoming'
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    discountRules: {
        minPercentage: {
            type: Number,
            min: 0,
            max: 100
        },
        maxPercentage: {
            type: Number,
            min: 0,
            max: 100
        },
        eligibleCategories: [String]
    },
}, { timestamps: true });


const participantSchema = new Schema({
    event: {
        type: Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    seller: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    products: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        originalPrice: {
            type: Number,
            required: true
        },
        discount: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        startDate: Date,
        endDate: Date
    }]
}, { timestamps: true });


// Pre-save hook for discount price calculation
// productSchema.pre('save', function (next) {
//     if (this.discounts && this.discounts.length > 0) {
//         this.discounts.forEach(discount => {
//             discount.discountedPrice = this.price * (1 - (discount.discountPercentage / 100));
//         });
//     }
//     next();
// });

// eventSchema.index({ status: 1, startDate: 1 });
// participantSchema.index({ event: 1, seller: 1 });




eventSchema.pre(/deleteOne|findOneAndDelete/, async function (next) {
    try {
        const doc = await this.model.findOne(this.getFilter());
        if (!doc) return next();
        const photoFields = ["poster"];
        await Promise.all(
            photoFields.map(async (field) => {
                if (doc[field]) {
                    const filePath = path.join(
                        __dirname, "../", "public",
                        doc[field]
                    );
                    console.log(filePath);
                    await fileDelete(filePath)
                }
            })
        );
        next();
    } catch (err) {
        next(err);
    }
});

module.exports = {
    Event: model('Event', eventSchema),
    Participant: model('Participant', participantSchema)
}