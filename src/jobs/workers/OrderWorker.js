const { Worker } = require("bullmq");
const { redis } = require("../../config/redisClient");

const Order = require("../../models/orderModel");
const { Product } = require("../../models/productModel");
const env = require("dotenv");
const mongoose = require("mongoose");

env.config();

const DATABASE_URL = process.env.MONGODB_URL;

// Connect to MongoDB with better error handling
const connectDB = async () => {
    try {
        await mongoose.connect(DATABASE_URL);
        console.log("DB connection successful ✅!");
    } catch (err) {
        console.error("Database connection failed:", err);
        process.exit(1);
    }
};

connectDB();

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
});

// Cancel orders that haven't completed Stripe checkout in 5 mins to handle conflicts
const orderQueue = new Worker('order-expiration', async (job) => {
    const { code } = job.data;

    console.log(`Processing order expiration for: ${code}`);

    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            // Find orders that are still pending and unpaid
            const orders = await Order.find({
                code: code,
                status: 'pending',
                isPaid: false
            }).session(session);

            if (!orders || orders.length === 0) {
                console.log(`No pending orders found for code: ${code}`);
                return;
            }

            // Check if any inventory was reserved
            const hasReservedInventory = orders.some(order => order.inventoryReserved);

            if (hasReservedInventory) {
                // Release reserved inventory
                for (const order of orders) {
                    if (order.inventoryReserved) {
                        await Product.updateOne(
                            { _id: order.productId },
                            {
                                $inc: {
                                    inventory: order.quantity,
                                    reservedInventory: -order.quantity
                                }
                            },
                            { session }
                        );
                    }
                }
                console.log(`Released reserved inventory for expired order: ${code}`);
            }

            // Mark orders as expired
            await Order.updateMany(
                {
                    code: code,
                    status: 'pending',
                    isPaid: false
                },
                {
                    $set: {
                        status: 'expired',
                        expiredAt: new Date(),
                        inventoryReserved: false
                    }
                },
                { session }
            );

            console.log(`Marked orders as expired: ${code}`);
        });

    } catch (error) {
        console.error(`Error processing order expiration for ${code}:`, error);
        throw error; // This will mark the job as failed
    } finally {
        await session.endSession();
    }
}, { connection: redis });

// Handle queue events
orderQueue.on('completed', (job, result) => {
    console.log(`Order expiration job completed: ${job.id}`);
});

orderQueue.on('failed', (job, err) => {
    console.error(`Order expiration job failed: ${job.id}`, err);
});

orderQueue.on('stalled', (job) => {
    console.warn(`Order expiration job stalled: ${job.id}`);
});

module.exports = orderQueue;


// Order expiration queue handler
