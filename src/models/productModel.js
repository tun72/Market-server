const { Schema, model } = require('mongoose');
const { ObjectId } = Schema.Types;


const typeSchema = new Schema({
    name: { type: String, required: true, unique: true },
    image: { type: String, required: true }
});


const categorySchema = new Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        trim: true,
    },
    type: {
        type: ObjectId,
        ref: 'Type',
        require: true
    },
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const productTagSchema = new Schema({
    name: {
        type: String,
        unique: true,
        lowercase: true,
    }
})


const productSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
        maxlength: [120, 'Product name cannot exceed 120 characters'],
    },
    body: {
        type: String,
        trim: true,
        required: true,
    },
    description: {
        type: String,
        trim: true,
        required: true,
    },
    category: {
        type: ObjectId,
        ref: 'Category',
        required: true
    },
    type: {
        type: ObjectId,
        ref: 'Type',
        require: true
    },
    brand: {
        type: String,
        default: "No brand"
    },
    tags: [{
        type: ObjectId,
        ref: "Tag"
    }],
    colors: [{
        type: String
    }],
    sizes: [{
        type: String
    }],
    images: [{
        type: String,
        required: true,
    }],
    price: {
        type: Number,
        required: [true, 'Product price is required'],
    },
    discount: {
        type: ObjectId,
        ref: "discount"
    },
    inventory: {
        type: Number,
        required: [true, "Inventory is required"]
    },

    shipping: { type: Number, min: 0, default: 0 },
    status: {
        type: String,
        enum: {
            values: ['draft', 'active', 'archived', "out_of_stock"],
            message: 'Invalid product status'
        },
        default: 'active'
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    // optional
    // warranty: {
    //     duration: Number,
    //     unit: {
    //         type: String,
    //         enum: ['days', 'months', 'years'],
    //         default: 'months'
    //     }
    // },
    cashOnDelivery: {
        type: Boolean,
        default: false
    },
    merchant: {
        type: ObjectId,
        ref: 'User',
        required: [true, 'Merchant reference is required'],
    },
    reservedInventory: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            ret.id = ret._id;
            delete ret._id;
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});


productSchema.virtual('optimize_images').get(function () {
    return this.images.map((img) => img.split(".")[0] + ".webp")
});

typeSchema.virtual('categories', {
    ref: 'Type',
    localField: '_id',
    foreignField: 'typeId'
});



module.exports = {
    Type: model("Type", typeSchema),
    Category: model('Category', categorySchema),
    ProductTag: model("Tag", productTagSchema),
    Product: model('Product', productSchema),
};