const sharp = require("sharp");
const resizeImage = async (filePath, width = 1200, height = 800, buffer) => {
    return new Promise((resolve, reject) => {
        try {
            sharp(buffer)
                .resize({
                    width,
                    height,
                })
                .toFormat('jpeg')
                .jpeg({
                    quality: 85,
                    mozjpeg: true,
                    force: true
                })
                .toFile(filePath)

            resolve("File successfully resie")
        } catch (error) {
            reject(error)
        }
    })
}

module.exports =
    resizeImage
