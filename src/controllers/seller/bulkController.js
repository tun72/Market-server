const UploadSession = require("../../models/uploadSession");
const { createOrConnectCategory } = require("../../services/categoryService");
const catchAsync = require("../../utils/catchAsync");
const csv = require('csv-parser');
const fs = require("node:fs");
const { getTypeByName } = require("../../services/typeService");
const AppError = require("../../utils/appError");
const Seller = require("../../models/sellerModel");
const { createOneProduct, checkSpelling } = require("../../services/productServices");

const sseConnections = new Map();

function validateRecord(record) {
    const errors = [];

    if (!record.name || record.name.trim() === '') {
        errors.push('Product name is required');
    }

    if (!record.price || isNaN(parseFloat(record.price))) {
        errors.push('Valid price is required');
    } else if (parseFloat(record.price) < 0) {
        errors.push('Price must be a positive number');
    }

    if (!record.inventory || isNaN(parseInt(record.inventory))) {
        errors.push('Valid inventory count is required');
    } else if (parseInt(record.inventory) < 0) {
        errors.push('Inventory must be a non-negative number');
    }

    if (record.discount && (isNaN(parseFloat(record.discount)) || parseFloat(record.discount) < 0)) {
        errors.push('Discount must be a non-negative number');
    }

    if (record.category && record.category.trim().length > 100) {
        errors.push('Category name too long (max 100 characters)');
    }

    if (record.type && record.type.trim().length > 50) {
        errors.push('Type name too long (max 50 characters)');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

async function processRecord(record, sessionId, merchantId) {
    try {
        let tags = [];
        if (record.tags && record.tags.trim() !== '') {
            tags = record.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        }

        let images = [];

        const type = await getTypeByName(record.type);

        if (!type) {
            return {
                success: false,
                error: 'Your product type is not supported',
            };
        }

        const category = await createOrConnectCategory(record.category, type._id);

        const productData = {
            name: record.name.trim(),
            description: record.description ? record.description.trim() : '',
            body: record.body ? record.body.trim() : '',
            price: parseFloat(record.price),
            inventory: parseInt(record.inventory),
            category: category._id.toString(),
            type: type._id.toString(),
            images: images,
            tags: tags,
            merchant: merchantId
        };

        const product = await createOneProduct(productData);

        return {
            success: true,
            product: product._id
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

function sendSSEUpdate(sessionId, data) {
    const connection = sseConnections.get(sessionId);
    if (connection && !connection.destroyed && !connection.writableEnded) {
        try {
            // Add proper SSE formatting with id and retry
            const sseData = `id: ${Date.now()}\ndata: ${JSON.stringify(data)}\n\n`;
            connection.write(sseData);

            // Force flush the data
            if (connection.flush) {
                connection.flush();
            }
        } catch (error) {
            console.error('Error sending SSE update:', error);
            sseConnections.delete(sessionId);
        }
    }
}

async function processCSVFile(filePath, sessionId, uploadSession, merchant, total, res) {
    return new Promise((resolve, reject) => {
        let lineNumber = 0;
        let processedCount = 0;
        const batchSize = 5; // Process in smaller batches
        const recordQueue = [];

        const processBatch = async () => {
            if (recordQueue.length === 0) return;

            const batch = recordQueue.splice(0, batchSize);

            for (const { record, currentLineNumber } of batch) {
                try {
                    await processCSVRecord(record, currentLineNumber, sessionId, uploadSession, merchant, total);
                    processedCount++;
                } catch (error) {
                    console.error(`Error processing line ${currentLineNumber}:`, error);
                    await handleRecordError(error, record, currentLineNumber, sessionId, uploadSession, total);
                    processedCount++;
                }
            }

            // Check if we're done
            if (processedCount >= lineNumber && streamEnded) {
                try {
                    await handleStreamEnd(sessionId, uploadSession, lineNumber, filePath, res);
                    resolve();
                } catch (error) {
                    console.error('Error completing upload session:', error);
                    reject(error);
                }
            } else if (recordQueue.length > 0) {
                // Process next batch
                setImmediate(processBatch);
            }
        };

        let streamEnded = false;

        const stream = fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (record) => {
                lineNumber++;
                recordQueue.push({ record, currentLineNumber: lineNumber });

                // Start processing if this is the first batch
                if (recordQueue.length === batchSize) {
                    setImmediate(processBatch);
                }
            })
            .on('end', () => {
                streamEnded = true;
                // Process remaining records
                if (recordQueue.length > 0) {
                    setImmediate(processBatch);
                } else if (processedCount >= lineNumber) {
                    // No records to process, complete immediately
                    handleStreamEnd(sessionId, uploadSession, lineNumber, filePath, res)
                        .then(resolve)
                        .catch(reject);
                }
            })
            .on('error', async (error) => {
                try {
                    await handleStreamError(error, sessionId, uploadSession, filePath);
                    reject(error);
                } catch (saveError) {
                    console.error('Error saving error status:', saveError);
                    reject(saveError);
                }
            });
    });
}

async function processCSVRecord(record, lineNumber, sessionId, uploadSession, merchant, total) {
    try {
        let result;
        const validation = validateRecord(record);
        if (!validation.valid) {
            result = {
                success: false,
                error: validation.errors.join(', ')
            };
        } else {
            // Perform spelling check
            const filteredContent = await checkSpelling({
                name: record.name,
                description: record.description || '',
                body: record.body || ''
            });

            const parsedContent = JSON.parse(filteredContent);
            if (parsedContent.isValidProduct === false) {
                result = {
                    success: false,
                    error: "Product content is not valid"
                };
            } else {
                record.name = parsedContent.name || record.name;
                record.description = parsedContent.description || record.description;
                record.body = parsedContent.body || record.body;

                result = await processRecord(record, sessionId, merchant._id);
            }
        }

        if (result.success) {
            uploadSession.successfulRecords = (uploadSession.successfulRecords || 0) + 1;
        } else {
            const errorRecord = {
                row: lineNumber,
                record,
                error: result.error
            };
            uploadSession.bulkUploadErrors = uploadSession.bulkUploadErrors || [];
            uploadSession.bulkUploadErrors.push(errorRecord);
            uploadSession.failedRecords = (uploadSession.failedRecords || 0) + 1;
        }

        uploadSession.processedRecords = (uploadSession.processedRecords || 0) + 1;
        uploadSession.totalRecords = Math.max(uploadSession.totalRecords || 0, lineNumber);

        // Send update with proper calculation
        const progressPercentage = total > 0 ?
            Math.round((uploadSession.processedRecords / total) * 100) :
            Math.round((uploadSession.processedRecords / lineNumber) * 100);

        sendSSEUpdate(sessionId, {
            type: 'progress',
            sessionId,
            processed: uploadSession.processedRecords,
            success: uploadSession.successfulRecords,
            failed: uploadSession.failedRecords,
            current: {
                row: lineNumber,
                data: record,
                status: result.success ? 'success' : 'failed',
                error: result.success ? null : result.error
            },
            progress: progressPercentage
        });

        // Save less frequently to improve performance
        if (uploadSession.processedRecords % 25 === 0) {
            await uploadSession.save();
        }

    } catch (error) {
        throw error;
    }
}

// Handle errors
async function handleRecordError(error, record, lineNumber, sessionId, uploadSession, total) {
    const errorRecord = {
        row: lineNumber,
        record,
        error: error.message
    };

    uploadSession.bulkUploadErrors = uploadSession.bulkUploadErrors || [];
    uploadSession.bulkUploadErrors.push(errorRecord);
    uploadSession.failedRecords = (uploadSession.failedRecords || 0) + 1;
    uploadSession.processedRecords = (uploadSession.processedRecords || 0) + 1;
    uploadSession.totalRecords = Math.max(uploadSession.totalRecords || 0, lineNumber);

    const progressPercentage = total > 0 ?
        Math.round((uploadSession.processedRecords / total) * 100) :
        Math.round((uploadSession.processedRecords / lineNumber) * 100);

    sendSSEUpdate(sessionId, {
        type: 'progress',
        sessionId,
        processed: uploadSession.processedRecords,
        success: uploadSession.successfulRecords || 0,
        failed: uploadSession.failedRecords,
        current: {
            row: lineNumber,
            data: record,
            status: 'failed',
            error: error.message
        },
        progress: progressPercentage
    });

    if (uploadSession.processedRecords % 25 === 0) {
        await uploadSession.save();
    }
}

// stream completion
async function handleStreamEnd(sessionId, uploadSession, totalLines, filePath, res) {
    uploadSession.status = 'completed';
    uploadSession.endTime = new Date();
    uploadSession.totalRecords = totalLines;
    await uploadSession.save();

    // Send completion update
    sendSSEUpdate(sessionId, {
        type: 'completed',
        sessionId,
        processed: uploadSession.processedRecords,
        success: uploadSession.successfulRecords || 0,
        failed: uploadSession.failedRecords || 0,
        totalRecords: totalLines
    });

    // Keep connection alive a bit longer for final message delivery
    setTimeout(() => {
        // Clean up file
        fs.unlink(filePath, (err) => {
            if (err) console.error('Error deleting file:', err);
        });

        // Close SSE connection
        setTimeout(() => {
            const connection = sseConnections.get(sessionId);
            if (connection && !connection.destroyed) {
                try {
                    connection.write('data: {"type":"close"}\n\n');
                    connection.end();
                } catch (err) {
                    console.error('Error closing SSE connection:', err);
                }
            }
            sseConnections.delete(sessionId);
        }, 2000);
    }, 1000);
}

// Handle stream errors
async function handleStreamError(error, sessionId, uploadSession, filePath) {
    console.error('Stream processing error:', error);

    uploadSession.status = 'error';
    uploadSession.endTime = new Date();
    await uploadSession.save();

    sendSSEUpdate(sessionId, {
        type: 'error',
        sessionId,
        error: error.message
    });

    // Clean up with delay
    setTimeout(() => {
        // Clean up file
        fs.unlink(filePath, (err) => {
            if (err) console.error('Error deleting file:', err);
        });

        // Close connection
        const connection = sseConnections.get(sessionId);
        if (connection && !connection.destroyed) {
            try {
                connection.end();
            } catch (err) {
                console.error('Error closing SSE connection:', err);
            }
        }
        sseConnections.delete(sessionId);
    }, 1000);
}

exports.BulkUpload = catchAsync(async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const filePath = req.file.path;
    const total = parseInt(req.body.total) || 0;
    const userId = req.userId;

    const merchant = await Seller.findById(userId);

    if (!merchant) {
        return next(new AppError("You're not allowed", 401));
    }

    try {
        // Create upload session in database
        const uploadSession = new UploadSession({
            sessionId,
            filename: req.file.originalname,
            status: 'processing',
            startTime: new Date(),
            successfulRecords: 0,
            failedRecords: 0,
            processedRecords: 0,
            totalRecords: 0,
            errors: []
        });
        await uploadSession.save();

        // Set up SSE with proper headers for HTTPS
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
            'Transfer-Encoding': 'chunked'
        });

        // Disable timeout for long-running processes
        res.setTimeout(0);

        // Handle client disconnect
        req.on('close', () => {
            console.log(`Client disconnected for session ${sessionId}`);
            sseConnections.delete(sessionId);
        });

        req.on('error', (error) => {
            console.error(`Request error for session ${sessionId}:`, error);
            sseConnections.delete(sessionId);
        });

        sseConnections.set(sessionId, res);

        // Send initial connection message
        sendSSEUpdate(sessionId, {
            type: 'connected',
            sessionId,
            message: 'Connection established, starting file processing...'
        });

        // Send heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
            const connection = sseConnections.get(sessionId);
            if (connection && !connection.destroyed && !connection.writableEnded) {
                try {
                    connection.write(': heartbeat\n\n');
                } catch (error) {
                    console.error('Heartbeat error:', error);
                    clearInterval(heartbeatInterval);
                    sseConnections.delete(sessionId);
                }
            } else {
                clearInterval(heartbeatInterval);
            }
        }, 30000); // Send heartbeat every 30 seconds

        // Store interval reference for cleanup
        if (!res.heartbeatInterval) {
            res.heartbeatInterval = heartbeatInterval;
        }

        // Process the CSV file
        await processCSVFile(filePath, sessionId, uploadSession, merchant, total, res);

        // Clean up heartbeat
        clearInterval(heartbeatInterval);

    } catch (error) {
        console.error('Bulk upload error:', error);

        // Clean up file
        fs.unlink(filePath, (err) => {
            if (err) console.error('Error deleting file:', err);
        });

        // Send error to client if connection exists
        if (sseConnections.has(sessionId)) {
            sendSSEUpdate(sessionId, {
                type: 'error',
                sessionId,
                error: error.message
            });

            // Clean up connection
            setTimeout(() => {
                const connection = sseConnections.get(sessionId);
                if (connection && !connection.destroyed) {
                    try {
                        connection.end();
                    } catch (err) {
                        console.error('Error closing connection:', err);
                    }
                }
                sseConnections.delete(sessionId);
            }, 1000);
        }

        return next(new AppError(error.message, 400));
    }
});