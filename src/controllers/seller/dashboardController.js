const Order = require("../../models/orderModel");
const { Product } = require("../../models/productModel");
const Seller = require("../../models/sellerModel");
const AppError = require("../../utils/appError");
const catchAsync = require("../../utils/catchAsync");

exports.getStatus = catchAsync(async (req, res) => {
    try {
        const userId = req.userId

        if (!userId) {
            return next(new AppError("Access Denied!", 403))
        }
        const merchant = await Seller.findById(userId);
        if (!merchant) {
            return next(new AppError("This account is not registered.", 403));
        }
        const merchantId = merchant._id

        // Get current date ranges
        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);



        // 1. Total Revenue Aggregation
        const revenueStats = await Order.aggregate([
            {
                $match: {
                    merchant: merchantId,
                    status: 'confirm'
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            {
                $unwind: "$productDetails"
            },
            {
                $addFields: {
                    totalPrice: { $multiply: ["$quantity", { $add: ["$productDetails.price", "$productDetails.shipping"] }] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalPrice" }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalRevenue: 1
                }
            }
        ]);

        console.log(revenueStats);


        // 2. Total Orders Aggregation
        const orderStats = await Order.aggregate([
            {
                $match: {
                    merchant: merchantId,
                    createdAt: { $gte: startOfLastMonth }
                }
            },
            {
                $group: {
                    _id: "$code" // Group by order code to count unique orders
                }
            },
            {
                $group: {
                    _id: null,
                    orders: { $push: "$$ROOT" }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalOrders: { $size: "$orders" }
                }
            }
        ]);

        console.log(orderStats);


        // Get order counts for current and last month separately for percentage calculation
        const [currentMonthOrders, lastMonthOrders] = await Promise.all([
            Order.aggregate([
                { $match: { merchant: merchantId, createdAt: { $gte: startOfCurrentMonth } } },
                { $group: { _id: "$code" } },
                { $count: "total" }
            ]),
            Order.aggregate([
                {
                    $match: {
                        merchant: merchantId,
                        createdAt: {
                            $gte: startOfLastMonth,
                            $lt: startOfCurrentMonth
                        }
                    }
                },
                { $group: { _id: "$code" } },
                { $count: "total" }
            ])
        ]);

        console.log(currentMonthOrders, lastMonthOrders);

        // 3. Total Users Aggregation (users who made orders)
        const [currentMonthUsers, lastMonthUsers] = await Promise.all([
            Order.aggregate([
                { $match: { merchant: merchantId, createdAt: { $gte: startOfCurrentMonth } } },
                { $group: { _id: "$userId" } },
                { $count: "total" }
            ]),
            Order.aggregate([
                {
                    $match: {
                        merchant: merchantId,
                        createdAt: {
                            $gte: startOfLastMonth,
                            $lt: startOfCurrentMonth
                        }
                    }
                },
                { $group: { _id: "$userId" } },
                { $count: "total" }
            ])
        ]);

        console.log(currentMonthUsers, lastMonthUsers);


        // 4. Total Products Count
        const totalProducts = await Product.countDocuments({ merchant: merchantId });

        console.log(totalProducts);


        // Calculate percentage changes
        const calculatePercentageChange = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return ((current - previous) / previous * 100);
        };

        const currentOrderCount = currentMonthOrders[0]?.total || 0;
        const lastOrderCount = lastMonthOrders[0]?.total || 0;
        const orderPercentageChange = calculatePercentageChange(currentOrderCount, lastOrderCount);

        const currentUserCount = currentMonthUsers[0]?.total || 0;
        const lastUserCount = lastMonthUsers[0]?.total || 0;
        const userPercentageChange = calculatePercentageChange(currentUserCount, lastUserCount);

        // Format response
        const stats = {
            totalRevenue: {
                value: revenueStats[0]?.totalRevenue || 0,
            },
            totalOrders: {
                value: currentOrderCount,
                percentageChange: orderPercentageChange,
            },
            totalCustomers: {
                value: currentUserCount,
                percentageChange: userPercentageChange,
            },
            totalProducts: {
                value: totalProducts,
            }
        };

        res.json({
            success: true,
            ...stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard statistics',
            error: error.message
        });
    }
});
