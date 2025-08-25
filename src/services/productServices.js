const { Product } = require("../models/productModel");
const { createOrConnectTag } = require("./tagServices");
const { genAI, genAIModel } = require("../config/googleGenAi");
const { spellingCheckPrompt, preInsertProductPrompt } = require("../utils/prompts");
const { createUserContent } = require("@google/genai")

exports.createOneProduct = async (productData) => {
    try {
        if (productData.tags && productData.tags.length > 0) {
            productData.tags = await createOrConnectTag(productData.tags)
        }

        return Product.create(productData)

    } catch (error) {
        console.error('Product creation error:', error);
        throw error;
    }
}


exports.updateOneProduct = async (productId, productData) => {
    try {
        if (productData.tags && productData.tags.length > 0) {
            productData.tags = await createOrConnectTag(productData.tags)
        }

        return Product.findByIdAndUpdate(productId, productData)

    } catch (error) {
        console.error('Product update error:', error);
        throw error;
    }
}

exports.checkSpelling = async ({ name, description, body }) => {
    const prompt = spellingCheckPrompt({
        name: name,
        description: description,
        body: body
    });

    const result = await genAI.models.generateContent({
        model: genAIModel,
        contents: [createUserContent([prompt])],
        config: {
            responseMimeType: "application/json",
        },
    });

    const response = result.text;

    return response;

}

exports.generateProducts = async ({ products }) => {
    const prompt = preInsertProductPrompt({ previousProducts: products })

    const result = await genAI.models.generateContent({
        model: genAIModel,
        contents: [createUserContent([prompt])],
        config: {
            responseMimeType: "application/json",
        },
    });

    const response = result.text;

    return response;

}