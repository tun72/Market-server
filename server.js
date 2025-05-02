const express = require("express");
const { json } = require("express");

const mongoose = require("mongoose");
const bodyParser = require("body-parser");

// dot env config
const dotenv = require("dotenv");
dotenv.config();

const path = require("path");

const app = express();

// routes import
const productRoute = require("./routes/productRoutes");
const categoryRoute = require("./routes/categoryRoutes")

app.use(express.static(path.join(__dirname, "public")));
app.use(json())
app.use(bodyParser.urlencoded({ extended: false }));

// routes
app.use("/api/v1/products", productRoute);
app.use("/api/v1/categories", categoryRoute);

// for 404 routes
// app.all("*", (req, res) => {
//   return res.send("404");
// });

const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URL)
  .then((_) => {
    console.log("database successfully connected ✅");
    app.listen(PORT, () => {
      console.log("Server is running at http://localhost:" + PORT);
    });
  })
  .catch((error) => console.log(error));
