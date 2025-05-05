// this will help you delete files
const fs = require("fs/promises");
const fileDelete = async (path) => {
  try {
    console.log(path);

    await fs.unlink(path);
  } catch (err) {
    return null;
  }
};

module.exports = fileDelete;
