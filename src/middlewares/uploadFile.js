const multer = require("multer")

const fileFilterConfig = (req, file, cb) => {
    const mimtypes = ["image/png", "image/jpg", "image/jpeg"]

    console.log("hit");

    if (mimtypes.includes(file.mimetype)) {
        cb(null, true)
    } else {
        cb(null, false)
    }
}

const fileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const type = file.mimetype.split("/")[0];
        if (type === "image") {
            cb(null, "uploads/images");
        } else {
            cb(null, "uploads/files");
        }
    },
    filename: function (req, file, cb) {
        const ext = file.mimetype.split("/")[1];
        const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9) + "." + ext;
        cb(null, uniqueSuffix);
    },
});

const upload = multer({ storage: fileStorage, fileFilter: fileFilterConfig, limits: { fieldSize: 1024 * 1024 * 10 } })

module.exports = upload


// memory
const fileFilterConfig_mermory = (req, file, cb) => {
    const mimtypes = ["image/png", "image/jpg", "image/jpeg"]
    if (mimtypes.includes(file.mimetype)) {
        cb(null, true)
    } else {
        cb(null, false)
    }
}

exports.uploadMemo = multer({ storage: multer.memoryStorage(), fileFilter: fileFilterConfig_mermory })






