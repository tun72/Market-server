const sharp = require("sharp");
const catchAsync = require("../utils/catchAsync");
const upload = require("../utils/upload");
const fs = require("fs/promises")
const path = require("node:path");

const fileDelete = require("../utils/fileDelete");
const helper = require("../utils/helpers");
const { Seller } = require("../models/userModel");


// seller 
// exports.isSellerAlreadyExist = helper.isAlreadyExist(Seller)
exports.isSellerExist = helper.isExist(Seller)

exports.updateImage = helper.updateImage({ Model: Seller, fieldNames: ["NRCPhoto"] })



exports.uploadImage = upload.fields(
    [
        { name: "nrc", maxCount: 1 },
        { name: "logo", maxCount: 1 }
    ]
)
exports.resizeImage = catchAsync(async (req, res, next) => {
    if (!req.files["nrc"]) return next();
    const directory = path.join(__dirname, "../", "../", 'public', 'img', 'sellers', 'nrc');
    await fs.mkdir(directory, { recursive: true });

    req.body.NRCPhoto = `nrc-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpeg`

    await sharp(req.files.nrc[0].buffer)
        .resize({
            width: 1200,
            height: 800,
            fit: 'contain',      // Maintain aspect ratio
            background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background
            withoutEnlargement: true // Don't upscale smaller images
        })
        .toFormat('jpeg')
        .jpeg({
            quality: 85,         // Good balance of quality/size
            mozjpeg: true,       // Enable MozJPEG optimizations
            force: true
        })
        .toFile(`public/img/sellers/nrc/${req.body.NRCPhoto}`)
    req.body.NRCPhoto = `img/sellers/nrc/${req.body.NRCPhoto}`
    next()
})

