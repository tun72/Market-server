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




        // 4. Total Products Count
        const totalProducts = await Product.countDocuments({ merchant: merchantId });




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
            isSuccess: true,
            ...stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            isSuccess: false,
            message: 'Error fetching dashboard statistics',
            error: error.message
        });
    }
});

const months = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
];



exports.getRevenueAndOrderChart = catchAsync(async (req, res, next) => {
    try {
        const userId = req.userId;
        if (!userId) return next(new AppError("Access Denied!", 403));

        const merchant = await Seller.findById(userId);
        if (!merchant) return next(new AppError("This account is not registered.", 403));

        const merchantId = merchant._id;

        const monthlyStats = await Order.aggregate([
            {
                $match: {
                    merchant: merchantId,
                    status: "confirm"
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
            { $unwind: "$productDetails" },
            {
                $addFields: {
                    totalPrice: {
                        $multiply: [
                            "$quantity",
                            { $add: ["$productDetails.price", "$productDetails.shipping"] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: { month: { $month: "$createdAt" } },
                    revenue: { $sum: "$totalPrice" },
                    orders: { $sum: 1 }
                }
            },
            {
                $project: {
                    month: "$_id.month",
                    revenue: 1,
                    orders: 1,
                    _id: 0
                }
            },
            { $sort: { month: 1 } }
        ]);



        const currentMonthIndex = new Date().getMonth();



        // Map results into your desired format
        const chartData = months.map((m, i) => {
            const found = monthlyStats.find(stat => stat.month === i + 1);
            return {
                month: m,
                revenue: found?.revenue || 0,
                orders: found?.orders || 0
            };
        });

        const rotatedMonths = [
            ...chartData.slice(currentMonthIndex),
            // ...chartData.slice(0, currentMonthIndex)
        ];

        // ---------- Final Response ----------
        res.json({
            isSuccess: true,
            // totalRevenue: revenueStats[0]?.totalRevenue || 0,
            chartData: rotatedMonths, // 👈 new data
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({
            isSuccess: false,
            message: "Error fetching dashboard statistics",
            error: error.message
        });
    }
});

exports.getTypeChart = catchAsync(async (req, res, next) => {
    const userId = req.userId;
    if (!userId) return next(new AppError("Access Denied!", 403));

    const merchant = await Seller.findById(userId);
    if (!merchant) return next(new AppError("This account is not registered.", 403));

    const merchantId = merchant._id;



    const typeStats = await Order.aggregate([
        {
            $match: {
                merchant: merchantId,
                status: "confirm"
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
        { $unwind: "$productDetails" },
        {
            $lookup: {
                from: "types",
                localField: "productDetails.type",
                foreignField: "_id",
                as: "types"
            }
        },
        { $unwind: "$types" },
        {
            $group: {
                _id: "$types.name",   // group by type name
                totalRevenue: {
                    $sum: {
                        $multiply: [
                            "$quantity",
                            { $add: ["$productDetails.price", "$productDetails.shipping"] }
                        ]
                    }
                },
                totalOrders: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                category: "$_id",
                totalRevenue: 1,
                totalOrders: 1
            }
        }
    ]);

    // calculate percentages
    const totalRevenue = typeStats.reduce((sum, item) => sum + item.totalRevenue, 0);

    const chartData = typeStats.map(item => ({
        category: item.category,
        percentage: totalRevenue > 0 ? ((item.totalRevenue / totalRevenue) * 100).toFixed(2) : 0,
        totalRevenue: item.totalRevenue,
        totalOrders: item.totalOrders
    }));

    // Add meta info
    const statsByCategory = {
        categories: chartData.length,
        coverage: "100%", // because we covered all categories
        data: chartData
    };


    res.status(200).json({
        isSuccess: true,
        ...statsByCategory
    })

})