const { Queue } = require("bullmq")

const { redis } = require("../../config/redisClient")

const orderQueue = new Queue('order-expiration', {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 500
    }
});

module.exports = orderQueue