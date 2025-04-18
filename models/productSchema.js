const { Schema, model } = require('mongoose');
const { ObjectId } = Schema.Types;


const brandSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Brand name is required'],
        unique: true,
        trim: true,
        maxlength: [100, 'Brand name cannot exceed 100 characters'],
        index: true
    },
}, {
    timestamps: true,
});

const categorySchema = new Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        unique: true,
        trim: true,
        maxlength: [100, 'Category name cannot exceed 100 characters'],
        index: true
    },
    parent: {
        type: ObjectId,
        ref: 'Category',
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

categorySchema.virtual('subcategories', {
    ref: 'Category',
    localField: '_id',
    foreignField: 'parent'
});



const ShippingSchema = new Schema({
    weight: { type: Number, required: true }, // in kilograms
    dimensions: {
        length: Number,
        width: Number,
        height: Number,
        unit: { type: String, enum: ['cm', 'in'], default: 'cm' }
    },
    freeShipping: { type: Boolean, default: false },
    shippingCost: { type: Number, min: 0, default: 0 }
});

const AggregateRatingSchema = new Schema({
    ratingValue: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    reviewCount: { type: Number, min: 0, default: 0 }
});

const ReturnsPolicySchema = new Schema({
    policy: { type: String, enum: ['none', 'exchange', 'refund', 'store-credit'], default: 'none' },
    period: { type: Number, min: 0, max: 365, default: 30 } // days
});


// Main Product Schema
const ProductSchema = new Schema({
    title: {
        type: String,
        required: [true, 'Product title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    description: {
        type: String,
        trim: true,
    },
    sku: {
        type: String,
        required: [true, 'SKU is required'],
        unique: true,
        index: true,
        validate: {
            validator: function (v) {
                return /^[A-Z0-9-]{6,20}$/.test(v);
            },
            message: props => `${props.value} is not a valid SKU format!`
        }
    },
    brand: {
        type: ObjectId,
        ref: 'Brand',
        required: [true, 'Brand reference is required']
    },
    category: {
        type: ObjectId,
        ref: 'Category',
        required: [true, 'Category reference is required']
    },
    images: [{
        type: String,
        validate: {
            validator: function (v) {
                return /^(http|https):\/\/[^ "]+$/.test(v);
            },
            message: props => `${props.value} is not a valid URL!`
        }
    }],
    variations: [{
        type: ObjectId,
        ref: 'Variation'
    }],
    shipping: ShippingSchema,
    aggregateRating: AggregateRatingSchema,
    // reviews: [{
    //     type: ObjectId,
    //     ref: 'Review'
    // }],
    includes: [{
        type: String,
        trim: true,
        maxlength: [100, 'Include item cannot exceed 100 characters']
    }],
    packaging: {
        type: String,
        enum: ['none', 'eco-friendly', 'gift-wrap', 'original'],
        default: 'none'
    },
    warranty: {
        duration: Number,
        unit: { type: String, enum: ['days', 'months', 'years'] }
    },
    returns: ReturnsPolicySchema,
    tags: [{
        type: String,
        lowercase: true,
        maxlength: [50, 'Tag cannot exceed 50 characters']
    }],
    meta: {
        title: { type: String, trim: true, maxlength: 150 },
        description: { type: String, trim: true, maxlength: 300 }
    },
    relatedProducts: [{
        type: ObjectId,
        ref: 'Product'
    }],
    status: {
        type: String,
        enum: ['draft', 'active', 'archived', 'discontinued'],
        default: 'draft'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const variationSchema = new Schema({
    color: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    size: {
        type: String,
        required: true,
        uppercase: true,
        enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL']
    },
    image: {
        type: String,
    },
    offers: {
        price: {
            type: Number,
            required: true,
            min: [0, 'Price cannot be negative']
        },
        currency: {
            type: String,
            required: true,
            uppercase: true,
            enum: ['USD', 'EUR', 'GBP', 'JPY', "MMK"],
            default: 'USD'
        },
        salePrice: {
            type: Number,
            min: [0, 'Sale price cannot be negative'],
            validate: {
                validator: function (v) {
                    return v < this.offers.price;
                },
                message: 'Sale price must be less than regular price'
            }
        },
        priceValidUntil: {
            type: Date,
            validate: {
                validator: function (v) {
                    return v > Date.now();
                },
                message: 'Price validity date must be in the future'
            }
        },
        availability: {
            type: String,
            enum: ['in-stock', 'out-of-stock', 'pre-order', 'discontinued'],
            default: 'in-stock'
        }
    },
    stock: {
        quantity: {
            type: Number,
            required: true,
            min: [0, 'Stock quantity cannot be negative'],
            default: 0
        },
        locations: String,
        reorderThreshold: {
            type: Number,
            min: [0, 'Reorder threshold cannot be negative'],
            default: 10
        }
    }
}, { timestamps: true });

// // Indexes
// ProductSchema.index({ title: 'text', description: 'text', tags: 'text' });
// variationSchema.index({ color: 1, size: 1 }, { unique: true });

// // Virtuals
// ProductSchema.virtual('mainImage').get(function() {
//   return this.images.length > 0 ? this.images[0] : null;
// });


module.exports = {
    Brand: model('Brand', brandSchema),
    Category: model('Category', categorySchema),
    Variation: model('Variation', variationSchema),
    Product: model('Product', ProductSchema),
};