const mongoose = require('mongoose');

const adsSchema = new mongoose.Schema({
    link: {
        type: String,
        required: true
    },

    image: {
        type: String,
        required: true,
    },

});


const Ad = mongoose.model('Ad', adsSchema);

module.exports = Ad;