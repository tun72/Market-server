const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");
const globalErrorController = require("./controllers/errorController");
const cookieParser = require("cookie-parser")
const Admin = require("./models/adminModel");
const path = require("path");
const { setupSocket } = require("./socket");
const dotenv = require("dotenv");
const routes = require("./routes/v1/index")
dotenv.config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json()).use(cookieParser());

app.use(cors());
app.options("*", cors());

app.use(bodyParser.json());
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use(routes)
app.use(globalErrorController);

const PORT = process.env.PORT || 3000;
mongoose
  .connect(process.env.MONGODB_URL)
  .then((_) => {
    return Admin.find()

  }).then((admin) => {

    if (!admin.length) {
      return Admin.create({ name: "admin", email: "admin@gmail.com", password: "admin@123" })
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
