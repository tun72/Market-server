const mongoose = require("mongoose");

const catchAsync = require("../../utils/catchAsync");
const ProductRecommend = require("../../utils/productRecommend");

exports.getRecommendedProduct = catchAsync(async (req, res, next) => {
    const userId = req.userId


    // Validate userId
    if (!userId) {
        return next(new AppError('User ID is required', 400));
    }

    if (!mongoose.isValidObjectId(userId)) {
        return next(new AppError('Invalid user ID format', 400));
    }



    const options = {
        limit: 10,
        excludeViewed: 'true',
        includeCategories: [],
        excludeCategories: [],
        minPrice: undefined,
        maxPrice: undefined,
        onlyFeatured: false
    };

    // Validate price range
    if (options.minPrice && options.maxPrice && options.minPrice > options.maxPrice) {
        return next(new AppError('Minimum price cannot be greater than maximum price', 400));
    }

    // Validate category IDs
    const allCategories = [...options.includeCategories, ...options.excludeCategories];
    for (const categoryId of allCategories) {
        if (!mongoose.isValidObjectId(categoryId)) {
            return next(new AppError(`Invalid category ID: ${categoryId}`, 400));
        }
    }

    try {
        // Get recommendations
        const recommendations = await ProductRecommend.getPersonalizedRecommendations(
            userId,
            options
        );

        // Prepare response
        const response = {
            isSuccess: true,
            products: recommendations.map(product => ({
                id: product._id,
                name: product.name,
                description: product.description,
                price: product.price,
                images: product.images,
                category: product.category,
                type: product.type,
                brand: product.brand,
                isFeatured: product.isFeatured,
                soldCount: product.soldCount,
                inventory: product.inventory,
                shipping: product.shipping,
                cashOnDelivery: product.cashOnDelivery,
                merchant: product.merchant,
                recommendationScore: product.recommendationScore,
                createdAt: product.createdAt,
                updatedAt: product.updatedAt
            })),
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('Get recommended products error:', error);
        return next(new AppError('Failed to get product recommendations. Please try again later.', 500));
    }
});