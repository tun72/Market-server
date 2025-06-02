const { Worker } = require("bullmq");
const { redis } = require("../../config/redisClient");
const path = require("path")
const sharp = require("sharp")
const fs = require("fs")
const imageWorker = new Worker("imageOptimize", async (job) => {
    const { filePath, fileName, width, height, quality, destPath } = job.data;
    const optimizeImagePath = path.join(
        __dirname,
        "../../..",
        destPath || "/uploads/optimize",
        fileName
    );

    await sharp(filePath)
        .resize(width, height)
        .webp({ quality })
        .toFile(optimizeImagePath);
}, { connection: redis }
)

imageWorker.on("completed", (job) => {
    console.log(`Job completed with result ${job.id}`);
});

imageWorker.on("failed", (job, err) => {
    console.log(err);

    console.log(`Job failed with result ${job.id} and error - ${err}`);
});