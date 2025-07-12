const { Schema, model } = require('mongoose');
const path = require('path');
const { fileDelete } = require('../utils/fileDelete');

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
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});


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
    discountProducts: [{
        type: Schema.Types.ObjectId,
        ref: "Discount"
    }]
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});


eventSchema.virtual('discount').get(function () {
    if (
        this.discountRules &&
        typeof this.discountRules.maxPercentage === 'number'
    ) {
        return `Up To ${this.discountRules.maxPercentage}%`;
    }
    return "Up to 0%";
});


eventSchema.pre('findOneAndDelete', async function () {
    const doc = await this.model.findOne(this.getFilter()).lean();
    if (!doc || !doc.poster) return;
    const filePath = path.join(__dirname, '../../uploads', doc.poster);
    await fileDelete(filePath);
});




module.exports = {
    Event: model('Event', eventSchema),
    Participant: model('Participant', participantSchema),
}


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
