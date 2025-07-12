const { Worker } = require("bullmq");
const { redis } = require("../../config/redisClient");

const Order = require("../../models/orderModel");
const { Product } = require("../../models/productModel");
const env = require("dotenv");
const mongoose = require("mongoose")
env.config();

const DATABASE_URL = process.env.MONGODB_URL;
mongoose
    .connect(DATABASE_URL)
    .then(() => {
        console.log("DB connection successful ✅!");
    })
    .catch((err) => console.log(err));

const orderWorker = new Worker('order-expiration', async job => {
    const { code } = job.data;

    try {
        // Find all pending orders with the given code
        const orders = await Order.find({ code, isPaid: false });
        if (orders.length === 0) {
            return
        }

        const orderIds = orders.map(order => order._id);

        await Order.updateMany({
            _id: { $in: orderIds }
        }, { $set: { status: "cancel" } })

        for (const order of orders) {
            await Product.findByIdAndUpdate(
                order.productId,
                { $inc: { inventory: +order.quantity } }
            );
        }

    } catch (error) {
        console.error(`Failed to process job ${job.id}:`, error);
        throw error;
    }
}, {
    connection: redis,
    concurrency: 10
});

orderWorker.on("completed", (job) => {
    console.log(`Job completed with result ${job.id}`);
});

orderWorker.on("failed", (job, err) => {
    console.log(err);
    console.log(`Job failed with result ${job.id} and error - ${err}`);
});