const SocketIOServer = require("socket.io")
const Message = require("./models/messageModel")

let io = null

const userSocketMap = new Map();
const setupSocket = (server) => {
    io = SocketIOServer(server, {
        cors: {
            origin: "*",
            credentials: true,
        },
    });


    const disconnect = (socket) => {
        for (const [userId, socketId] of userSocketMap.entries()) {
            if (socketId === socket.id) {
                userSocketMap.delete(userId);
                break;
            }
        }
    };


    const sendMessage = async (message) => {
        const senderSocketId = userSocketMap.get(message.sender);
        const recipientSocketId = userSocketMap.get(message.recipient);

        console.log(message);


        const createdMessage = await Message.create(message);
        const messageData = await Message.findById(createdMessage._id)
            .populate("sender")
            .populate("recipient");

        if (recipientSocketId) {
            io.to(recipientSocketId).emit("receiveMessage", messageData);
        }

        if (senderSocketId) {
            io.to(senderSocketId).emit("receiveMessage", messageData);
        }
    };


    io.on("connection", (socket) => {
        const userId = socket.handshake.query.userId;
        if (userId) {
            userSocketMap.set(userId, socket.id);
            io.emit("onlineUsers", Array.from(userSocketMap.keys()));
        } else {
            console.log(`User ID not provided during connection.`);
        }
        socket.on("sendMessage", sendMessage);
        socket.on("disconnect", () => disconnect(socket));
    });



};

const getSocket = () => {
    if (io) return io
}

module.exports = { setupSocket, getSocket, userSocketMap }