const { Redis } = require("ioredis")
const dotenv = require("dotenv")
dotenv.config()
exports.redis = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    //   password
    maxRetriesPerRequest: null,
});