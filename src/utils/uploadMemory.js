const multer = require("multer")

const fileFilterConfig = (req, file, cb) => {
    const mimtypes = ["image/png", "image/jpg", "image/jpeg"]


    if (mimtypes.includes(file.mimetype)) {
        cb(null, true)
    } else {
        cb(null, false)
    }
}

const upload = multer({ storage: multer.memoryStorage(), fileFilter: fileFilterConfig })

module.exports = upload

