// this will help you delete files
const fs = require("fs/promises");
const fileDelete = async (path) => {
  try {
    await fs.unlink(path);
  } catch (err) {
    // console.log(err);

    return null;
  }
};

module.exports = fileDelete;
