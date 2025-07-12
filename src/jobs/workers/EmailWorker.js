const { Worker } = require("bullmq");
const { redis } = require("../../config/redisClient");
const { sendEmail } = require("../../utils/sendMail");

const worker = new Worker(
    "emailQueue",
    async (job) => {
        // console.log(`Processing job: ${job.id}`, job.data);
        await sendEmail(job.data);
        // Your processing logic here
    },
    { connection: redis }
);

worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed`, err);
});