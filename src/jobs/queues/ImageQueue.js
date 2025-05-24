const { Queue } = require("bullmq")

const { redis } = require("../../config/redisClient")

const ImageQueue = new Queue("imageOptimize", { connection: redis });

module.exports = ImageQueue