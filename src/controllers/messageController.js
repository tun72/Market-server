
const factory = require("./handlerFactory");
const Message = require("../models/messageModel")
exports.aliasMessages = (req, res, next) => {
    const user1 = req.userId;
    const user2 = req.body.id;


    req.query.sort = "timestamp";
    req.filter = {
        $or: [
            { sender: user1, recipient: user2 },
            { sender: user2, recipient: user1 },
        ],
    };

    console.log(req.filter);

    next();
};


exports.getAllMessages = factory.getAll({ Model: Message })