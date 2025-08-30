const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");
const globalErrorController = require("./controllers/errorController");
const cookieParser = require("cookie-parser")
const { setupSocket } = require("./socket");
const dotenv = require("dotenv");
const routes = require("./routes/v1/index");
const Admin = require("./models/adminModel");
const { generateRandToken } = require("./utils/generateToken");
const orderModel = require("./models/orderModel");
const cron = require("node-cron")


dotenv.config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json()).use(cookieParser());
app.use(express.static("public"));
app.use(express.static("uploads"));

let whitelist = ["http://localhost:5173", "http://localhost:5174", "https://ayeyarmart.studentactivities.online", "http://150.95.81.76:5173", "https://ayeyar-merchant.vercel.app"]
const corsOptions = {
  origin: function (
    origin,
    callback
  ) {
    if (!origin) return callback(null, true);
    if (whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};


app.use(cors(corsOptions));

// app.options("*", cors());

app.use(bodyParser.json());
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}


app.use(routes)
app.get("/", (req, res) => {
  res.redirect(process.env.FRONTEND_URL)
})


const deleteExpiredOrdersDailyCron = () => {
  // Run every 6 hours
  cron.schedule('0 3 * * *', async () => {
    console.log('🕒 Running frequent expired orders cleanup...');

    try {
      const deleteResult = await orderModel.deleteMany({
        status: 'expired'
      });

      if (deleteResult.deletedCount > 0) {
        console.log(`🗑️  Deleted ${deleteResult.deletedCount} expired orders`);
      }

    } catch (error) {
      console.error('❌ Error during frequent cleanup:', error);
    }
  });
};

deleteExpiredOrdersDailyCron();

app.use(globalErrorController);


const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URL)
  .then((_) => {
    return Admin.find()

  }).then((admin) => {

    if (!admin.length) {
      return Admin.create({ name: "admin", email: "admin@gmail.com", password: "admin@123", passwordConfirm: "admin@123", randToken: generateRandToken() })
    }
    return admin
  }).then(() => {
    console.log("database successfully connected ✅");

    const server = app.listen(PORT, () => {
      console.log("Server is running at http://localhost:" + PORT);
    });
    setupSocket(server);

  })
  .catch((error) => console.log(error));
