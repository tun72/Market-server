// this will help you delete files
const fs = require("fs/promises");
const path = require("path");


const removeFiles = async (path) => {
  try {
    await fs.unlink(path);
  } catch (err) {
    // console.log(err);
    return null;
  }
}

exports.fileDelete = async (path) => {
  await removeFiles(path)
};


exports.removeImages = async (originalFiles, optimizeFiles, target = "/uploads/images") => {
  if (originalFiles && originalFiles.length > 0) {
    for (const originalFile of originalFiles) {
      const originalfilePath = path.join(
        __dirname,
        "../..",
        target,
        originalFile
      );
      await removeFiles(originalfilePath)
    }
  }

  if (optimizeFiles) {
    for (const optimizedFile of optimizeFiles) {
      const optimizefilePath = path.join(
        __dirname,
        "../..",
        "/uploads/optimize",
        optimizedFile
      );
      await removeFiles(optimizefilePath);
    }
  }
}

