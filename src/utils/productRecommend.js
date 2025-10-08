const mongoose = require("mongoose")
const { Product } = require("../models/productModel");
const Analytic = require("../models/userAnalyticsModel");

class ProductRecommend {
    static async getPersonalizedRecommendations(userId, options = {}) {
        const {
            limit = 10,
            excludeViewed = true,
            includeCategories = [],
            excludeCategories = [],
            minPrice,
            maxPrice,
            onlyFeatured = false
        } = options;

        const userAnalytics = await Analytic.find({ user: userId })
            .populate('product category')
            .sort({ createdAt: -1 })
            .limit(100); // Limit to recent 100 interactions for performance

        if (userAnalytics.length === 0) {
            return await this.getPopularProducts(limit, options);
        }

        // Analyze user behavior
        const behaviorAnalysis = this.analyzeUserBehavior(userAnalytics);

        // Get viewed/purchased products to exclude if needed
        const excludedProductIds = excludeViewed ?
            userAnalytics.map(a => a.product?._id?.toString()).filter(Boolean) : [];

        // Get recommendations using multiple strategies with higher limits to ensure enough products
        const [categoryBased, collaborative, trending] = await Promise.all([
            this.getCategoryBasedRecommendations(behaviorAnalysis.topCategories, userId, limit * 2, excludedProductIds),
            this.getCollaborativeRecommendations(userId, limit * 2, excludedProductIds),
            this.getTrendingRecommendations(behaviorAnalysis.topCategories, limit * 2, excludedProductIds)
        ]);

        // Combine and process recommendations
        let allRecommendations = [...categoryBased, ...collaborative, ...trending];

        // Remove duplicates
        allRecommendations = this.removeDuplicates(allRecommendations);

        // Apply additional filters
        allRecommendations = this.applyFilters(allRecommendations, {
            includeCategories,
            excludeCategories,
            minPrice,
            maxPrice,
            onlyFeatured
        });

        // Score and sort recommendations
        const scoredRecommendations = this.scoreAndSortRecommendations(
            allRecommendations,
            behaviorAnalysis
        );

        // If we don't have enough recommendations, supplement with popular products
        if (scoredRecommendations.length < limit) {
            const additionalNeeded = limit - scoredRecommendations.length;
            const existingIds = scoredRecommendations.map(p => p._id.toString());
            const allExcluded = [...excludedProductIds, ...existingIds];

            const additionalProducts = await this.getPopularProducts(
                additionalNeeded * 2, // Get extra to account for filtering
                { ...options, excludeIds: allExcluded }
            );

            const filteredAdditional = this.applyFilters(additionalProducts, {
                includeCategories,
                excludeCategories,
                minPrice,
                maxPrice,
                onlyFeatured
            });

            const scoredAdditional = this.scoreAndSortRecommendations(
                filteredAdditional,
                behaviorAnalysis
            );

            scoredRecommendations.push(...scoredAdditional);
        }

        return scoredRecommendations.slice(0, limit);
    }

    static analyzeUserBehavior(analytics) {
        const categoryWeights = {};
        const actionWeights = { purchase: 10, order: 8, view: 2, search: 3 };
        const recentDays = 30;
        const cutoffDate = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000);

        analytics.forEach(analytic => {
            if (!analytic.category?._id) return;

            const categoryId = analytic.category._id.toString();
            const baseWeight = actionWeights[analytic.status] || 1;
            const isRecent = new Date(analytic.createdAt) > cutoffDate;
            const finalWeight = isRecent ? baseWeight * 1.5 : baseWeight;

            categoryWeights[categoryId] = (categoryWeights[categoryId] || 0) + finalWeight;
        });

        const topCategories = Object.entries(categoryWeights)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([categoryId]) => categoryId);

        return {
            topCategories,
            categoryWeights,
            totalInteractions: analytics.length,
            purchaseHistory: analytics
                .filter(a => ['purchase', 'order'].includes(a.status))
                .map(a => a.product?._id)
                .filter(Boolean)
        };
    }

    /**
     * Get category-based recommendations
     */
    static async getCategoryBasedRecommendations(topCategories, userId, limit, excludedProductIds = []) {
        if (!topCategories || topCategories.length === 0) return [];

        try {
            const categoryObjectIds = topCategories.map(id => new mongoose.Types.ObjectId(id));
            const excludedObjectIds = excludedProductIds.map(id => new mongoose.Types.ObjectId(id));

            const query = {
                category: { $in: categoryObjectIds },
                status: 'active',
                inventory: { $gt: 0 }
            };

            if (excludedObjectIds.length > 0) {
                query._id = { $nin: excludedObjectIds };
            }

            const products = await Product.find(query)
                .populate('category type merchant')
                .sort({ soldCount: -1, isFeatured: -1, createdAt: -1 })
                .limit(limit)
                .lean();

            return products;
        } catch (error) {
            console.error('Error in category-based recommendations:', error);
            return [];
        }
    }

    /**
     * Get collaborative filtering recommendations
     */
    static async getCollaborativeRecommendations(userId, limit, excludedProductIds = []) {
        try {
            // Find users with similar interests
            const userCategories = await Analytic.distinct('category', { user: userId });

            if (userCategories.length === 0) return [];

            // Find similar users
            const similarUsers = await Analytic.aggregate([
                {
                    $match: {
                        user: { $ne: new mongoose.Types.ObjectId(userId) },
                        category: { $in: userCategories }
                    }
                },
                {
                    $group: {
                        _id: '$user',
                        commonInteractions: { $sum: 1 },
                        categories: { $addToSet: '$category' }
                    }
                },
                {
                    $match: { commonInteractions: { $gte: 2 } } // Lowered threshold
                },
                { $sort: { commonInteractions: -1 } },
                { $limit: 15 } // Increased similar users
            ]);

            if (similarUsers.length === 0) return [];

            const similarUserIds = similarUsers.map(u => u._id);
            const excludedObjectIds = excludedProductIds.map(id => new mongoose.Types.ObjectId(id));

            // Get products that similar users liked
            const recommendations = await Analytic.find({
                user: { $in: similarUserIds },
                status: { $in: ['purchase', 'order', 'view'] }
            })
                .populate({
                    path: 'product',
                    match: {
                        status: 'active',
                        inventory: { $gt: 0 },
                        ...(excludedObjectIds.length > 0 && { _id: { $nin: excludedObjectIds } })
                    },
                    populate: { path: 'category type merchant' }
                })
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();

            return recommendations
                .map(r => r.product)
                .filter(Boolean)
                .slice(0, limit);

        } catch (error) {
            console.error('Error in collaborative recommendations:', error);
            return [];
        }
    }

    /**
     * Get trending products in user's categories
     */
    static async getTrendingRecommendations(topCategories, limit, excludedProductIds = []) {
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            // If no top categories, get trending from all categories
            const matchQuery = {
                createdAt: { $gte: thirtyDaysAgo }
            };

            if (topCategories && topCategories.length > 0) {
                const categoryObjectIds = topCategories.map(id => new mongoose.Types.ObjectId(id));
                matchQuery.category = { $in: categoryObjectIds };
            }

            const trendingProducts = await Analytic.aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: '$product',
                        interactions: { $sum: 1 },
                        purchases: {
                            $sum: { $cond: [{ $in: ['$status', ['purchase', 'order']] }, 1, 0] }
                        }
                    }
                },
                { $sort: { purchases: -1, interactions: -1 } },
                { $limit: limit }
            ]);

            const productIds = trendingProducts.map(t => t._id).filter(Boolean);
            const excludedObjectIds = excludedProductIds.map(id => new mongoose.Types.ObjectId(id));

            const query = {
                _id: { $in: productIds },
                status: 'active',
                inventory: { $gt: 0 }
            };

            if (excludedObjectIds.length > 0) {
                query._id.$nin = excludedObjectIds;
            }

            const products = await Product.find(query)
                .populate('category type merchant')
                .lean();

            return products;

        } catch (error) {
            console.error('Error in trending recommendations:', error);
            return [];
        }
    }

    /**
     * Get popular products for new users or fallback
     */
    static async getPopularProducts(limit, options = {}) {
        const query = {
            status: 'active',
            inventory: { $gt: 0 }
        };

        if (options.onlyFeatured) {
            query.isFeatured = true;
        }

        if (options.excludeIds && options.excludeIds.length > 0) {
            const excludedObjectIds = options.excludeIds.map(id =>
                typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
            );
            query._id = { $nin: excludedObjectIds };
        }

        // Apply category filters if provided
        if (options.includeCategories && options.includeCategories.length > 0) {
            const categoryObjectIds = options.includeCategories.map(id => new mongoose.Types.ObjectId(id));
            query.category = { $in: categoryObjectIds };
        }

        if (options.excludeCategories && options.excludeCategories.length > 0) {
            const categoryObjectIds = options.excludeCategories.map(id => new mongoose.Types.ObjectId(id));
            query.category = { $nin: categoryObjectIds };
        }

        // Apply price filters
        if (options.minPrice) query.price = { $gte: options.minPrice };
        if (options.maxPrice) {
            query.price = query.price || {};
            query.price.$lte = options.maxPrice;
        }

        const products = await Product.find(query)
            .populate('category type merchant')
            .sort({ soldCount: -1, isFeatured: -1, createdAt: -1 })
            .limit(limit)
            .lean();

        return products;
    }

    /**
     * Remove duplicate products
     */
    static removeDuplicates(products) {
        const seen = new Set();
        return products.filter(product => {
            if (!product?._id) return false;
            const id = product._id.toString();
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    /**
     * Apply filters to products
     */
    static applyFilters(products, filters) {
        return products.filter(product => {
            // Category filters
            if (filters.includeCategories?.length > 0) {
                const categoryId = product.category?._id?.toString();
                if (!categoryId || !filters.includeCategories.includes(categoryId)) {
                    return false;
                }
            }

            if (filters.excludeCategories?.length > 0) {
                const categoryId = product.category?._id?.toString();
                if (categoryId && filters.excludeCategories.includes(categoryId)) {
                    return false;
                }
            }

            // Price filters
            if (filters.minPrice && product.price < filters.minPrice) return false;
            if (filters.maxPrice && product.price > filters.maxPrice) return false;

            // Featured filter
            if (filters.onlyFeatured && !product.isFeatured) return false;

            return true;
        });
    }

    /**
     * Score and sort recommendations
     */
    static scoreAndSortRecommendations(products, behaviorAnalysis) {
        return products.map(product => {
            let score = 0;

            // Base product metrics
            score += (product.soldCount || 0) * 0.1;
            score += product.isFeatured ? 10 : 0;
            score += (product.inventory > 10) ? 5 : 2;
            score += product.cashOnDelivery ? 2 : 0;

            // Category preference boost
            const categoryId = product.category?._id?.toString();
            if (categoryId && behaviorAnalysis.categoryWeights && behaviorAnalysis.categoryWeights[categoryId]) {
                score += behaviorAnalysis.categoryWeights[categoryId] * 0.5;
            }

            // Price attractiveness (sweet spot pricing)
            if (product.price >= 10 && product.price <= 200) score += 3;
            if (product.price >= 20 && product.price <= 100) score += 2;

            // Availability bonus
            if (product.status === 'active') score += 5;

            return { ...product, recommendationScore: score };
        }).sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0));
    }
}

module.exports = ProductRecommend