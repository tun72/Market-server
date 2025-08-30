const { body, validationResult } = require("express-validator");
const Order = require("../../models/orderModel");
const Seller = require("../../models/sellerModel");
const AppError = require("../../utils/appError");
const catchAsync = require("../../utils/catchAsync");
const factory = require("../handlerFactory");
const mongoose = require("mongoose");
const { Product } = require("../../models/productModel");

const { getSocket, userSocketMap } = require("../../socket");

exports.getAllOrders = catchAsync(async (req, res, next) => {
    const userId = req.userId;

    // Extract pagination and sorting parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || '-createdAt'; // Default: newest first
    const skip = (page - 1) * limit;

    // Parse sort parameter
    let sortField = 'createdAt';
    let sortOrder = -1; // Default descending

    if (sort) {
        if (sort.startsWith('-')) {
            sortField = sort.substring(1);
            sortOrder = -1; // Descending
        } else {
            sortField = sort;
            sortOrder = 1; // Ascending
        }
    }

    // Map field names to actual fields in aggregation result
    const fieldMapping = {
        'name': 'user.name',
        'email': 'user.email',
        'createdAt': 'createdAt',
        'status': 'status',
        'totalAmount': 'totalAmount',
        'totalProducts': 'totalProducts',
        'isPaid': 'isPaid',
        'isDelivered': 'isDelivered',
        'code': 'code'
    };

    // Use mapped field or default to createdAt
    const actualSortField = fieldMapping[sortField] || 'createdAt';
    const sortObject = { [actualSortField]: sortOrder };

    const merchant = await Seller.findById(userId);
    if (!merchant) {
        return next(new AppError("This account is not registered.", 403));
    }

    const aggregationPipeline = [
        {
            $match: { merchant: merchant._id }
        },
        {
            $group: {
                _id: "$code",
                products: { $push: "$$ROOT" },
                totalProducts: { $sum: 1 },
                status: { $first: "$status" },
                createdAt: { $first: "$createdAt" },
                user: { $first: "$userId" },
                isPaid: { $first: "$isPaid" },
                payment: { $first: "$payment" },
                isDelivered: { $first: "$isDelivered" }
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userDetails"
            }
        },
        {
            $unwind: "$products"
        },
        {
            $lookup: {
                from: "products",
                localField: "products.productId",
                foreignField: "_id",
                as: "productDetails"
            }
        },
        {
            $unwind: "$productDetails"
        },
        {
            $addFields: {
                "products.name": "$productDetails.name",
                "products.price": "$productDetails.price",
                "products.image": "$productDetails.image",
                "products.totalPrice": {
                    $multiply: ["$products.quantity", "$productDetails.price"]
                }
            }
        },
        {
            $group: {
                _id: "$_id",
                status: { $first: "$status" },
                createdAt: { $first: "$createdAt" },
                user: { $first: { $arrayElemAt: ["$userDetails", 0] } },
                isPaid: { $first: "$isPaid" },
                payment: { $first: "$payment" },
                isDelivered: { $first: "$isDelivered" },
                totalProducts: { $first: "$totalProducts" },
                products: { $push: "$products" },
                totalAmount: { $sum: "$products.totalPrice" }
            }
        },
        {
            $sort: sortObject
        },
        {
            $project: {
                _id: 0,
                code: "$_id",
                status: 1,
                createdAt: 1,
                isPaid: 1,
                payment: 1,
                products: {
                    productId: 1,
                    quantity: 1,
                    name: 1,
                    price: 1,
                    image: 1,
                    totalPrice: 1
                },
                user: {
                    name: 1,
                    email: 1,
                    address: {
                        street: "$user.shippingAddresse.street",
                        city: "$user.shippingAddresse.city",
                        state: "$user.shippingAddresse.state",
                        zipCode: "$user.shippingAddresse.zipCode",
                        country: "$user.shippingAddresse.country"
                    }
                },
                totalProducts: 1,
                totalAmount: 1,
                isDelivered: 1
            }
        }
    ];

    // Get total count for pagination info
    const totalCountPipeline = [
        ...aggregationPipeline.slice(0, -2), // Remove sort and project stages
        { $count: "total" }
    ];

    // Add pagination stages
    const paginatedPipeline = [
        ...aggregationPipeline,
        { $skip: skip },
        { $limit: limit }
    ];

    // Execute both pipelines
    const [orders, totalCountResult] = await Promise.all([
        Order.aggregate(paginatedPipeline),
        Order.aggregate(totalCountPipeline)
    ]);

    const totalOrders = totalCountResult[0]?.total || 0;

    res.status(200).json({
        isSuccess: true,
        orders: orders,
        pagination: {
            entriesPerPage: limit,
            page: page,
            totalResult: totalOrders,
            foundResult: orders.length
        },
    });
});

exports.updateOrders = [
    body("code", "Order code is required.").notEmpty(),
    body("status", "Status is required").notEmpty().custom((value) => {
        const all_status = ["pending", "order placed", "confirmed", "cancel", "processing", "shipped", "delivered", "expired"];
        if (!all_status.includes(value)) {
            throw new Error("Invalid status. Allowed: " + all_status.join(", "));
        }
        return true;
    }),

    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            return next(new AppError(errors[0].msg, 400));
        }

        const { code, status } = req.body;
        const userId = req.userId;

        // Find order with additional details
        const orders = await Order.find({ merchant: userId, code }).populate('productId.product');
        if (!orders || orders.length === 0) {
            return next(new AppError("No order found with that code.", 404));
        }

        const order = orders[0];
        const currentStatus = order.status;

        // Validate status transition
        const validTransitions = {
            'pending': ['order confirmed', 'cancel'],
            'order placed': ['confirmed', 'cancel'],
            'confirmed': ['processing', 'cancel'],
            "processing": ["shipped", "cancel"],
            'shipped': ['delivered', 'cancel'],
            'delivered': [], // Terminal status
            'cancel': ['confirm'], // Allow reconfirmation of cancelled orders
            'expired': [] // Terminal status
        };

        if (!validTransitions[currentStatus]?.includes(status)) {
            return next(new AppError(
                `Cannot change order status from '${currentStatus}' to '${status}'`,
                400
            ));
        }

        // Handle specific status changes
        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                // Handle status-specific logic first - pass the orders array instead of single order
                switch (status) {
                    case 'confirmed':
                        await handleOrderConfirmation(orders, session);
                        break;
                    case 'cancel':
                        await handleOrderCancellation(orders, session);
                        break;
                    case 'delivered':
                        await handleOrderSuccess(orders, session);
                        break;
                }

                // Update order status
                const updatedOrders = await Order.updateMany(
                    { code, merchant: userId },
                    {
                        status: status,
                        updatedAt: new Date(),
                    },
                    { session, new: true }
                );

                if (updatedOrders.modifiedCount === 0) {
                    throw new Error("Failed to update order status");
                }

                // Get the updated orders data for socket emission
                const updatedOrderList = await Order.find({ code, merchant: userId })
                    .populate({ path: "productId", select: "price shipping name images" })
                    .lean()
                    .session(session);





                // Prepare orders with total calculation in the correct format
                let totalAmount = 0
                const ordersWithTotal = updatedOrderList.map(order => {
                    let total = 0;
                    if (order.productId && order.productId.price) {
                        const amount = Math.round(order.productId.price * 100);
                        const shippingFee = (order.productId.shipping * 100)
                        total = [(amount + shippingFee) * order.quantity] / 100;
                        totalAmount += total;
                    }
                    return {
                        ...order,
                        total
                    };
                });

                // Emit socket event to customer with proper order details
                const io = getSocket();
                const customerSocketId = userSocketMap.get(updatedOrderList[0].userId.toString());




                if (customerSocketId) {
                    io.to(customerSocketId).emit('order-status-changed', ordersWithTotal);
                } else {
                    console.log(`Customer socket not found for user: ${updatedOrderList[0].userId}`);
                }
            });

            // Session will be automatically ended by withTransaction
            res.status(200).json({
                message: "Order status updated successfully.",
                isSuccess: true,
                data: {
                    orderCode: code,
                    newStatus: status,
                    previousStatus: currentStatus
                }
            });

        } catch (error) {
            // Don't manually abort - withTransaction handles this automatically
            // Just end the session and handle the error
            return next(new AppError(error.message || "Failed to update order", 500));
        } finally {
            // Ensure session is always ended
            await session.endSession();
        }
    })
];


// Helper functions for status-specific logic
async function handleOrderConfirmation(order, session) {
    // Reserve inventory
    for (const item of order) {
        const productId = item.productId?._id || item.productId; // Ensure correct productId extraction
        if (!productId) {
            throw new Error("Invalid productId in order.");
        }

        await Product.findByIdAndUpdate(
            productId,
            { $inc: { inventory: -item.quantity } },
            { session }
        );
    }
}

async function handleOrderCancellation(order, session) {
    // Release reserved inventory for each item in the order

    for (const item of order) {
        const productId = item.productId?._id || item.productId; // Ensure correct productId extraction
        if (!productId) {
            throw new Error("Invalid productId in order.");
        }

        // If the order status is "confirmed", increase the inventory
        if (item.status === "confirmed") {
            await Product.findByIdAndUpdate(
                productId,
                { $inc: { inventory: item.quantity } },
                { session }
            );
        }
    }
}

async function handleOrderSuccess(order, session) {
    // email the user
    // Release reserved inventory
    // await Product.findByIdAndUpdate(
    //     order.productId,
    //     { $inc: { soldCount: order.quantity } },
    //     { session }
    // );
}

// async function handleDeliveryConfirmation(order, session) {
//     // Update delivery timestamp
//     await Order.findByIdAndUpdate(
//         order._id,
//         { deliveredAt: new Date() },
//         { session }
//     );

//     // Release reserved inventory (convert to sold)
//     for (const item of order.items) {
//         await Product.findByIdAndUpdate(
//             item.product._id,
//             {
//                 $inc: { reserved: -item.quantity, sold: item.quantity },
//                 $push: { salesHistory: { orderId: order._id, quantity: item.quantity, date: new Date() } }
//             },
//             { session }
//         );
//     }
// }

// async function handleRefund(order, session) {
//     // Process refund
//     const refundResult = await processRefund(order);
//     if (!refundResult.success) {
//         throw new Error("Refund processing failed");
//     }

//     await Order.findByIdAndUpdate(
//         order._id,
//         {
//             refunded: true,
//             refundId: refundResult.refundId,
//             refundedAt: new Date()
//         },
//         { session }
//     );
// }

// async function sendStatusUpdateNotification(order, status) {
//     // Send email/SMS to customer
//     const notifications = {
//         'confirmed': 'Your order has been confirmed and is being prepared.',
//         'processing': 'Your order is being processed.',
//         'shipped': 'Your order has been shipped.',
//         'delivered': 'Your order has been delivered.',
//         'cancelled': 'Your order has been cancelled.',
//         'refunded': 'Your refund has been processed.'
//     };

//     // Implement notification service
//     await NotificationService.send({
//         to: order.customer.email,
//         subject: `Order ${order.orderNumber} - ${status}`,
//         message: notifications[status],
//         orderId: order._id
//     });
// }

// // Placeholder functions for payment processing
// async function processPayment(order) {
//     // Implement payment gateway integration
//     return { success: true, paymentId: 'pay_' + Date.now() };
// }

// async function initiateRefund(order) {
//     // Implement refund processing
//     return { success: true, refundId: 'ref_' + Date.now() };
// }

// async function processRefund(order) {
//     // Implement refund processing
//     return { success: true, refundId: 'ref_' + Date.now() };
// }
