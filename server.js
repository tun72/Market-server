const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");


const globalErrorController = require("./controllers/errorController");


// Routes
const productRoute = require("./routes/productRoutes")
const authRoute = require("./routes/authRoute");
const adminRoute = require("./routes/adminRoute")


// dot env config
const dotenv = require("dotenv");
dotenv.config();

const path = require("path");
const Admin = require("./models/adminModel");
const { setupSocket } = require("./socket");


const app = express();


app.use(cors());
app.options("*", cors());

// routes import

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());


if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}


// routes
app.use("/api/v1/products", productRoute);
app.use("/api/v1/auth", authRoute);

app.use("/api/v1/admin", adminRoute);

// for 404 routes
// app.all("*", (req, res) => {
//   return res.send("404");
// });

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
