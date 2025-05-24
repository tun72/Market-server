const { Type } = require("../models/productModel")

exports.getTypeByName = async (type) => {
    return Type.findOne({ name: type })
}

// exports.createOrConnectType = async (type) => {
//     return Type.findOneAndUpdate(
//         { name: type },
//         { $setOnInsert: { name: type } },
//         {
//             upsert: true,
//             new: true,
//             runValidators: true,
//             setDefaultsOnInsert: true
//         }
//     );
// }
