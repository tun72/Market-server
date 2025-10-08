const nodemailer = require("nodemailer")
const dotenv = require("dotenv")
const fs = require("node:fs/promises")
const path = require("path")
dotenv.config()
const sendEmail = async ({ receiver, subject, html }) => {



    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.SENDER_EMAIL,
            pass: process.env.SENDER_PASSWORD,
        },
    });




    await transporter.sendMail({
        from: process.env.SENDER_EMAIL,
        to: receiver,
        subject: subject,
        html: html,
    });




};



const getEmailContent = async ({ filename, data }) => {
    try {
        let template = await fs.readFile(
            path.join(__dirname, "../view", filename),
            "utf-8"
        );


        // Simple replacements
        template = template
            .replace("${{date}}", data.date)
            .replace("${{orderCode}}", data.orderCode)
            .replace("${{totalProducts}}", data.totalProducts)
            .replace('${{totalAmount}}', data.totalAmount)
            .replace("${{paymentMethod}}", data.paymentMethod || "Visa •••• 1234")
            .replace("${{deliveryDate}}", "August 30 - Sept 2, 2025");


        return template;
    } catch (error) {
        console.error("Error loading email template:", error);
        throw error;
    }
};

const getCodContent = async ({ filename, data }) => {
    try {
        let template = await fs.readFile(
            path.join(__dirname, "../view", filename),
            "utf-8"
        );


        // Simple replacements
        template = template
            .replace("${{date}}", data.date)
            .replace("${{orderCode}}", data.code)
            .replace("${{customerName}}", data.customerName)
            .replace("${{customerPhone}}", data?.customerPhone ?? "")
            .replace("${{totalProducts}}", data.totalProducts)
            .replace('${{totalAmount}}', data.totalAmount)
            .replace("${{deliveryAddress}}", data.deliveryAddress)
            .replace("${{merchantEarnings}}", data.merchantEarnings)
            .replace("${{merchantName}}", data.merchantName)

        return template;
    } catch (error) {
        console.error("Error loading email template:", error);
        throw error;
    }
};



module.exports = {
    sendEmail,
    getEmailContent,
    getCodContent
}