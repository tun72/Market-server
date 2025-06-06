const { faker } = require("@faker-js/faker");
const Seller = require("../../src/models/sellerModel")
const mongoose = require("mongoose");
const fs = require("node:fs/promises")
const path = require("node:path")
const env = require("dotenv");
const { generateRandToken } = require("../../src/utils/generateToken");
const { Product, Type } = require("../../src/models/productModel");
const { getTypeByName } = require("../../src/services/typeService");
const { createOrConnectCategory } = require("../../src/services/categoryService");
const { createOrConnectTag } = require("../../src/services/tagServices");
const bcrypt = require("bcryptjs")
env.config();

const DATABASE_URL = process.env.MONGODB_URL;
mongoose
    .connect(DATABASE_URL)
    .then(() => {
        console.log("DB connection successful ✅!");
    })
    .catch((err) => console.log(err));

const fileNames = ["rice"]

const readJSON = async (file) =>
    JSON.parse(await fs.readFile(path.join(__dirname, file), "utf-8"));

const importData = async () => {
    try {
        const users = [];


        const password = await bcrypt.hash("password123", 12)

        for (let i = 0; i < 6; i++) {

            const userData = {
                name: faker.internet.username(),
                email: faker.internet.email(),
                role: "seller",
                password,
                businessName: faker.company.name(),
                phone: faker.phone.number(),
                active: 1,
                address: {
                    street: faker.location.streetAddress(),
                    city: faker.location.city(),
                    state: faker.location.state(),
                    country: faker.location.country(),
                },
                description: faker.lorem.paragraph(),
                NRCNumber: faker.number.int(),
                NRCBack: faker.image.url(),
                NRCFront: faker.image.url(),
                balance: 100,
                rating: 5,
                logo: faker.image.url(),
                randToken: generateRandToken()
            };

            users.push(userData);
        }

        const user_array = await Seller.insertMany(users);
        console.log(user_array);

        await Promise.all(fileNames.map(async (name, i) => {
            // console.log(name);

            const products = await readJSON(`../products/${name}.json`);

            await Promise.all(products.map(async (product) => {

                const type = await getTypeByName(product.type);
                if (!type) {
                    return;
                }

                const category = await createOrConnectCategory(product.category, type._id)
                product.tags = await createOrConnectTag([type.name, "Local", "Myanmar", "Ayeyarwaddy Region", category.name])
                product.images = ["https://cmhlprodblobstorage1.blob.core.windows.net/sys-master-cmhlprodblobstorage1/h4f/h67/9302416621598/1000Wx1000H_Default-WorkingFormat_null"];
                product.merchant = user_array[i]._id;
                product.description = "This is a local product of Myanmar (Ayeyarwaddy Region). It is a high-quality product that is grown and harvested with care. The product is known for its freshness and taste, making it a popular choice among consumers.";
                product.status = "active";
                product.shipping = 1000;
                product.inventory = 100;
                product.price = parseFloat(product.price.replace(",", ""));

                product.category = category._id.toString();
                product.type = type._id.toString();
                return product;
            }))

            await Product.insertMany(products)

        }))

        // console.log(`Successfully seeded ${users.length} users`);
    } catch (err) {
        console.error("Error inserting data:", err);
    } finally {
        process.exit();
    }
};

// DELETE ALL DATA FROM DB
const deleteData = async () => {
    try {
        await Seller.deleteMany()
        await Product.deleteMany();
        console.log("Data successfully deleted!");
    } catch (err) {
        console.log(err);
    }
    process.exit();
};

if (process.argv[2] === "--import") {
    importData();
} else if (process.argv[2] === "--delete") {
    deleteData();
}
