const { validationResult } = require('express-validator');

const handleErrorMessage = (req, res, next) => {
    console.log(req.body);

    const result = validationResult(req);
    if (!result.isEmpty()) {
        return res.status(400).json({ errors: result.mapped() });
    } else {
        next();
    }
}

module.exports = handleErrorMessage;