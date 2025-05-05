const sharp = require("sharp");
const catchAsync = require("../utils/catchAsync");
const upload = require("../utils/upload");
const fs = require("fs/promises")
const path = require("node:path");
const { Seller } = require("../models/sellerModel");
const AppError = require("../utils/appError");
const fileDelete = require("../utils/fileDelete");


// seller 
exports.isSellerExist = catchAsync(async (req, res, next) => {
    const isSeller = await Seller.findById(req.params.id)
    if (!isSeller) return next(new AppError("No seller found within that ID", 404))
    next()

})

exports.updateImage = catchAsync(async (req, res, next) => {
    if (req.body.NRCPhoto) {
        const originalDoc = await Seller.findById(req.params.id)

        const filePath = path.join(
            __dirname, "../", "public",
            originalDoc.NRCPhoto
        );
        console.log(filePath);
        await fileDelete(filePath)
    }

    next()
})



exports.uploadImage = upload.fields(
    [
        { name: "nrc", maxCount: 1 },
        { name: "logo", maxCount: 1 }
    ]
)

exports.resizeImage = catchAsync(async (req, res, next) => {
    if (!req.files["nrc"]) return next();
    const directory = path.join(__dirname, "../", 'public', 'img', 'sellers', 'nrc');
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

