module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    res
        .status(err.statusCode)
        .json({
            message: err?.message || "Some Error happen!",
            status: err?.status || "failed",
        });
};
