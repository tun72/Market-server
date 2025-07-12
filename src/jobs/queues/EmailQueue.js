const { Queue } = require("bullmq")

const { redis } = require("../../config/redisClient")

const emailQueue = new Queue("emailQueue", {
    connection: redis,
}); // Specify Redis connection using object

module.exports = emailQueue
