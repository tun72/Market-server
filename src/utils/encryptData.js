const CryptoJS = require("crypto-js");
exports.encrypt = async (data) => {
    const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(data), 'secret-key-123').toString();
    return {
        encryptedData: ciphertext
    };
};