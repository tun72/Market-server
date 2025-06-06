const { Type } = require("../models/productModel")

exports.getTypeByName = async (type) => {
    return Type.findOne({ name: type })
}

