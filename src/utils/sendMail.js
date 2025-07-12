const nodemailer = require("nodemailer")

export const sendEmail = async ({ receiver, subject, html }) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.SENDER_MAIL,
            pass: process.env.SENDER_PASSWORD,
        },
    });

    const info = await transporter.sendMail({
        from: process.env.SENDER_MAIL,
        to: receiver,
        subject: subject,
        html: html,
    });

    console.log("Message is send to ", info.messageId);
};