const AppError = require("./appError")
exports.checkPhotoIfNotExist = (file) => {
    if (!file) {
        new AppError("Invalid Image", 409)
    }
};


exports.checkPhotoIfNotExistArray = (fileArr) => {
    if (fileArr.length === 0) {
        throw (new AppError("Invalid Image", 409))
    }
};



