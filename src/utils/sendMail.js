const nodemailer = require("nodemailer")
const dotenv = require("dotenv")
const fs = require("node:fs/promises")
const path = require("path")
dotenv.config()
const sendEmail = async ({ receiver, subject, html }) => {
    // const transporter = nodemailer.createTransport({
    //     service: "gmail",
    //     auth: {
    //         user: process.env.SENDER_MAIL,
    //         pass: process.env.SENDER_PASSWORD,
    //     },
    // });

    const transporter = nodemailer.createTransport({
        host: 'sandbox.smtp.mailtrap.io',
        port: 2525,
        secure: false, // use SSL
        auth: {
            user: process.env.SENDER_EMAIL,
            pass: process.env.SENDER_PASSWORD,
        }
    });

    const info = await transporter.sendMail({
        from: "ayeyar-market@email.com",
        to: receiver,
        subject: subject,
        html: html,
    });

    console.log("Message is send to ", info.messageId);
};


const getEmailContent = async ({ filename, data }) => {
    try {
        const html = await fs.readFile(path.join(__dirname, '../view/', filename), "utf-8");
        return html.replace(/{{(\w+)}}/g, (_, key) => data[key] || '');
    } catch (error) {
        console.error("Error loading email template:", error);
        throw error;
    }
}

module.exports = {
    sendEmail,
    getEmailContent
}