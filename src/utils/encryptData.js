const CryptoJS = require("crypto-js");
exports.encrypt = async (data) => {
    console.log(data);

    const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(data), 'secret-key-123').toString();
    return {
        encryptedData: ciphertext
    };
};


const test = "U2FsdGVkX1/4lPTxHBWIZp112dVS/tlq+Z4c5WorYKBFmHGZK4sh8FNce06axZ9/bSZV+B0aGRiLX3Dysok1eORuEQeIyism1VYblQ4Q19MgZRZLN/ed5dIsO+sELugljfv6CQt58sif+gYdun4QIS30NiHZvfgQyKJtRjhOvu8qdOFxzongLa+7lNhf3Du665XwXs5cO6Fz/UlPqHg/gZtGFSDXMhk+SDBkglSGIiOUKEuAS/dcNULIxWiaKwAQ0KTeViA1uNHB/96ffZu0pOTd1xwtjVsVVQLVoxzF9nbg4UN8+z2UYRbvi5oJSHQVEos5OXQoEcyJNGTXwEsdcwWzRpEjE46SbhYWqZkqOCUo7bgZB0ym2ZgPIrMY1LioOyQyY4bciN/tTHn1fCfqaM+FjQ9u1/QoAr/X/MHX23N7EhYHH26/IIXulgaLiREKU6C9AQXfVh/SF38kE91rqA=="

const decryptAES = (encryptedBase64, key) => {
    const decrypted = CryptoJS.AES.decrypt(test, "secret-key-123");
    if (decrypted) {
        try {
            console.log(decrypted);
            const str = decrypted.toString(CryptoJS.enc.Utf8);
            console.log(JSON.parse(str));

            if (str.length > 0) {
                return str;
            } else {
                return 'error 1';
            }
        } catch (e) {
            return 'error 2';
        }
    }
    return 'error 3';
};


decryptAES()
// 

