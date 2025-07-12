const AppError = require("./appError");

class ApiFeature {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ["page", "sort", "limit", "fields"];
    excludedFields.forEach((el) => delete queryObj[el]);

    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(
      /\b(gte|gt|lte|lt|regex)\b/g,
      (match) => `$${match}`
    );
    let filter = JSON.parse(queryStr);

    if (queryStr.indexOf("$regex")) {
      for (let key in filter) {
        const key_ = Object.keys(filter[key])[0];
        if (key_ === "$regex") {
          filter[key]["$options"] = "i";
        }
      }
    }

    for (const [obj, key] of Object.entries(filter)) {
      if (
        (typeof key === "object" && Object.keys(key).length === 0) ||
        key === "" ||
        key == null
      ) {
        delete filter[obj];
      }
    }


    try {
      this.query = this.query.find(filter);
    } catch (e) {
      throw new AppError("Something went wrong please check", 400)
    }

    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(",").join("");
      this.query.sort(sortBy);
    } else {
      this.query.sort("-createdAt");
    }
    return this;
  }

  limits() {
    if (this.queryString.fields) {
      const limitFields = this.queryString.fields.split(",").join("");
      this.query.select(limitFields);
    } else {
      this.query.select("-__v");
    }
    return this;
  }

  paginate() {

    const page = this.queryString.page * 1 || 1;
    const limit = this.queryString.limit * 1 || 100;
    const skip = (page - 1) * limit;

    this.query = this.query.sort({ _id: 1 }).skip(skip).limit(limit);

    return this;
  }



  populate(fields) {
    if (this.queryString.fields) return this;

    this.query = this.query.populate(`${fields.join(" ")}`);

    return this;
  }
}

module.exports = ApiFeature;
