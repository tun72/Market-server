const { body, validationResult } = require("express-validator");
const Order = require("../../models/orderModel");
const Seller = require("../../models/sellerModel");
const AppError = require("../../utils/appError");
const catchAsync = require("../../utils/catchAsync");
const factory = require("../handlerFactory");
const mongoose = require("mongoose");
const { Product } = require("../../models/productModel");

exports.getAllOrders = [
    catchAsync(async (req, res, next) => {
        const userId = req.userId
        const merchant = await Seller.findById(userId)
        if (!merchant) {
            next(AppError("This account is not registered.", 403))
        }
        req.query.merchant = merchant.id
        next()
    }), factory.getAll({
        Model: Order,
        fields: ["productId", "userId"]

    })
]


exports.updateOrders = [
    body("orderId", "Order Id is required.").custom((id) => {
        return mongoose.Types.ObjectId.isValid(id);
    }),
    body("status", "Status is required").notEmpty().custom((value) => {
        const all_status = ["pending", "confirmed", "cancelled", "processing", "shipped", "delivered", "completed", "refunded"];
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

        const { orderId, status } = req.body;

        // Find order with additional details
        const order = await Order.findById(orderId).populate('productId.product');
        if (!order) {
            return next(new AppError("No order found with that Id.", 404));
        }

        // Validate status transition
        const validTransitions = {
            'pending': ['confirmed', 'cancelled'],
            'confirmed': ['processing', 'cancelled'],
            'processing': ['shipped', 'cancelled'],
            'shipped': ['delivered', 'cancelled'],
            'delivered': ['completed', 'refunded'],
            'completed': ['refunded'],
            'cancelled': [], // Terminal state
            'refunded': []   // Terminal state
        };

        if (!validTransitions[order.status]?.includes(status)) {
            return next(new AppError(
                `Cannot change order status from '${order.status}' to '${status}'`,
                400
            ));
        }

        // Handle specific status changes
        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                // Update order status
                const updatedOrder = await Order.findByIdAndUpdate(
                    orderId,
                    {
                        status: status,
                        updatedAt: new Date(),
                    },
                    { new: true, session }
                );

                // Handle inventory and business logic based on status
                switch (status) {
                    case 'confirmed':
                        await handleOrderConfirmation(order, session);
                        break;
                    case 'cancelled':
                        await handleOrderCancellation(order, session);
                        break;
                    case 'delivered':
                        await handleDeliveryConfirmation(order, session);
                        break;
                    case 'refunded':
                        await handleRefund(order, session);
                        break;
                }

                // Send notifications
                // await sendStatusUpdateNotification(updatedOrder, status);
            });

            res.status(200).json({
                message: "Order updated successfully.",
                orderId: orderId,
                newStatus: status
            });

        } catch (error) {
            await session.abortTransaction();
            return next(new AppError(error.message || "Failed to update order", 500));
        } finally {
            session.endSession();
        }
    })
];

// Helper functions for status-specific logic
async function handleOrderConfirmation(order, session) {
    // Reserve inventory
    await Product.findByIdAndUpdate(
        order.productId,
        { $inc: { inventory: -item.quantity, reserved: item.quantity } },
        { session }
    );

    // Process payment if not already done
    if (!order.paymentProcessed) {
        const paymentResult = await processPayment(order);
        if (!paymentResult.success) {
            throw new Error("Payment processing failed");
        }

        await Order.findByIdAndUpdate(
            order._id,
            { paymentProcessed: true, paymentId: paymentResult.paymentId },
            { session }
        );
    }
}

async function handleOrderCancellation(order, session) {
    // Release reserved inventory
    for (const item of order.items) {
        await Product.findByIdAndUpdate(
            item.product._id,
            { $inc: { stock: item.quantity, reserved: -item.quantity } },
            { session }
        );
    }

    // Process refund if payment was made
    if (order.paymentProcessed) {
        await initiateRefund(order);
    }
}

async function handleDeliveryConfirmation(order, session) {
    // Update delivery timestamp
    await Order.findByIdAndUpdate(
        order._id,
        { deliveredAt: new Date() },
        { session }
    );

    // Release reserved inventory (convert to sold)
    for (const item of order.items) {
        await Product.findByIdAndUpdate(
            item.product._id,
            {
                $inc: { reserved: -item.quantity, sold: item.quantity },
                $push: { salesHistory: { orderId: order._id, quantity: item.quantity, date: new Date() } }
            },
            { session }
        );
    }
}

async function handleRefund(order, session) {
    // Process refund
    const refundResult = await processRefund(order);
    if (!refundResult.success) {
        throw new Error("Refund processing failed");
    }

    await Order.findByIdAndUpdate(
        order._id,
        {
            refunded: true,
            refundId: refundResult.refundId,
            refundedAt: new Date()
        },
        { session }
    );
}

async function sendStatusUpdateNotification(order, status) {
    // Send email/SMS to customer
    const notifications = {
        'confirmed': 'Your order has been confirmed and is being prepared.',
        'processing': 'Your order is being processed.',
        'shipped': 'Your order has been shipped.',
        'delivered': 'Your order has been delivered.',
        'cancelled': 'Your order has been cancelled.',
        'refunded': 'Your refund has been processed.'
    };

    // Implement notification service
    await NotificationService.send({
        to: order.customer.email,
        subject: `Order ${order.orderNumber} - ${status}`,
        message: notifications[status],
        orderId: order._id
    });
}

// Placeholder functions for payment processing
async function processPayment(order) {
    // Implement payment gateway integration
    return { success: true, paymentId: 'pay_' + Date.now() };
}

async function initiateRefund(order) {
    // Implement refund processing
    return { success: true, refundId: 'ref_' + Date.now() };
}

async function processRefund(order) {
    // Implement refund processing
    return { success: true, refundId: 'ref_' + Date.now() };
}
