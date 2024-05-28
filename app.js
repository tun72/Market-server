const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");

// dot env config
const dotenv = require("dotenv");
dotenv.config();

const path = require("path");

// csrf token set up
const csrf = require("csurf");
const csrfProtect = csrf();

const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: false }));

// csrf setup
app.use(csrfProtect);
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

// for 404 routes
app.all("*", (req, res) => {
  return res.send("404");
});

// to handel errors
// app.use();

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
