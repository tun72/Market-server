const jwt = require("jsonwebtoken");
const env = require("dotenv");

env.config();

exports.generateToken = async ({ id }) =>
  await jwt.sign({ id }, process.env.SECRET_KEY, {
    expiresIn: process.env.TOKEN_EXPIRE_TIME,
  });
