const SocketIOServer = require("socket.io")

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


    io.on("connection", (socket) => {
        const userId = socket.handshake.query.userId;
        if (userId) {
            userSocketMap.set(userId, socket.id);
            io.emit("onlineUsers");
        } else {
            console.log(`User ID not provided during connection.`);
        }
        socket.on("disconnect", () => disconnect(socket));
    });
};

const getSocket = () => {
    if (io) return io
}

module.exports = { setupSocket, getSocket, userSocketMap }