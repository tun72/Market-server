const jwt = require("jsonwebtoken");
const env = require("dotenv");
const { randomBytes } = require("crypto");
env.config();

exports.generateAccessToken = async ({ id }) =>
  jwt.sign({ id }, process.env.SECRET_KEY, {
    expiresIn: 60,
  });

exports.generateRefreshToken = async ({ id, email }) =>
  jwt.sign({ id, email }, process.env.SECRET_KEY, {
    expiresIn: "30d",
  });


exports.generateRandToken = () => (randomBytes(32).toString("hex"))
