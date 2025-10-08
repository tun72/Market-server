
const { param, body, validationResult } = require("express-validator");
const Customer = require("../../models/customerModel");
const AppError = require("../../utils/appError");
const catchAsync = require("../../utils/catchAsync");
const ImageQueue = require("../../jobs/queues/ImageQueue");
const { removeImages } = require("../../utils/fileDelete");

// Get customer profile by IDe
exports.getCustomerProfile = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    // Find customer by ID and populate if needed
    const customer = await Customer.findById(id).select("+randToken");

    if (!customer) {
        return next(new AppError("Customer not found", 404));
    }

    // Remove sensitive information before sending response
    customer.password = undefined;
    customer.randToken = undefined;

    res.status(200).json({
        status: "success",
        data: {
            customer
        }
    });
});

// Update customer profile
exports.updateCustomerProfile = [
    param("id", "Valid customer ID is required").isMongoId(),
    body("name", "Name must be at least 2 characters long").optional().trim().isLength({ min: 2 }).escape(),
    body("email", "Please provide a valid email").optional().isEmail().normalizeEmail(),
    body("phone", "Phone number is invalid").optional().matches(/^[0-9]+$/)
        .isLength({ min: 5, max: 12 })
        .withMessage("Phone number invalid."),
    body("street", "Street address is invalid").optional().trim().escape(),
    body("city", "City name is invalid").optional().trim().escape(),
    body("state", "State name is invalid").optional().trim().escape(),
    body("country", "Country name is invalid").optional().trim().escape(),
    body("postalCode", "Postal code is invalid").optional().trim().escape(),


    catchAsync(async (req, res, next) => {
        const errors = validationResult(req).array({ onlyFirstError: true });
        if (errors.length) {
            // Clean up uploaded image if validation fails
            if (req.files && req.files["image"] && req.files["image"].length > 0) {
                const originalFiles = [req.files["image"][0].filename];
                removeImages(originalFiles);
            }

            return next(new AppError(errors[0].msg, 400));
        }

        const { id } = req.params;
        let { name, email, phone, street, city, state, country, postalCode } = req.body;

        // Check if customer exists
        const existingCustomer = await Customer.findById(id);
        if (!existingCustomer) {
            // Clean up uploaded image if customer doesn't exist
            if (req.files && req.files["image"] && req.files["image"].length > 0) {
                const originalFiles = [req.files["image"][0].filename];
                removeImages(originalFiles);
            }
            return next(new AppError("Customer not found", 404));
        }

        // Check if email is already taken by another customer
        if (email && email !== existingCustomer.email) {
            const emailExists = await Customer.findOne({ email, _id: { $ne: id } });
            if (emailExists) {
                // Clean up uploaded image if email conflict
                if (req.files && req.files["image"] && req.files["image"].length > 0) {
                    const originalFiles = [req.files["image"][0].filename];
                    removeImages(originalFiles);
                }
                return next(new AppError("Email is already taken", 400));
            }
        }

        // Prepare update data
        const updateData = {};

        // Handle basic profile fields
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = Number(phone);

        // Handle address fields
        const addressFields = { street, city, state, country, postalCode };
        let hasAddressUpdates = false;

        Object.keys(addressFields).forEach(field => {
            if (addressFields[field] !== undefined) {
                updateData[`shippingAddresse.${field}`] = addressFields[field];
                hasAddressUpdates = true;
            }
        });

        // Handle image upload if provided
        if (req.files && req.files["image"] && req.files["image"].length > 0) {
            // Optimize image
            const splitName = req.files["image"][0].filename.split(".")[0] + ".webp";
            await ImageQueue.add("optimize-image", {
                filePath: req.files["image"][0].path,
                fileName: splitName,
                width: 400,
                height: 400,
                quality: 90,
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
            });

            updateData.image = req.files["image"][0].filename;

            // Remove old image if exists
            if (existingCustomer.image) {
                const oldImages = [existingCustomer.image];
                removeImages(oldImages);
            }
        }

        // Don't allow password updates through this endpoint
        if (req.body.password || req.body.passwordConfirm) {
            // Clean up uploaded image
            if (req.files && req.files["image"] && req.files["image"].length > 0) {
                const originalFiles = [req.files["image"][0].filename];
                removeImages(originalFiles);
            }
            return next(new AppError("Password updates are not allowed through this endpoint. Use password reset instead.", 400));
        }

        // Update customer
        const customer = await Customer.findByIdAndUpdate(
            id,
            updateData,
            {
                new: true,
                runValidators: true
            }
        );

        // Remove sensitive information before sending response
        customer.password = undefined;
        customer.randToken = undefined;

        res.status(200).json({
            message: "Profile updated successfully",
            isSuccess: true,
            data: {
                customer
            }
        });
    })
];
// Update customer shipping address
exports.updateShippingAddress = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { street, city, state, country, postalCode } = req.body;

    const customer = await Customer.findByIdAndUpdate(
        id,
        {
            shippingAddresse: {
                street,
                city,
                state,
                country,
                postalCode
            }
        },
        {
            new: true,
            runValidators: true
        }
    );

    if (!customer) {
        return next(new AppError("Customer not found", 404));
    }

    res.status(200).json({
        status: "success",
        data: {
            shippingAddress: customer.shippingAddresse
        }
    });
});
