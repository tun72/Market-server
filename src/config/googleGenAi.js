const { GoogleGenAI } = require("@google/genai")
const env = require("dotenv")

env.config()

exports.genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
exports.genAIModel = "gemini-2.0-flash";
