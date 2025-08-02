const Ad = require("../../models/adModel");
const factory = require("../handlerFactory");
exports.getAllAds = factory.getAll({ Model: Ad })