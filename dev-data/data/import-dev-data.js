const { faker } = require("@faker-js/faker");
const Seller = require("../../src/models/sellerModel")
const mongoose = require("mongoose");
const fs = require("node:fs/promises")
const path = require("node:path")
const env = require("dotenv");
const { generateRandToken } = require("../../src/utils/generateToken");
const { Product, Type, Category } = require("../../src/models/productModel");
const { getTypeByName } = require("../../src/services/typeService");
const { createOrConnectCategory } = require("../../src/services/categoryService");
const { createOrConnectTag } = require("../../src/services/tagServices");
const bcrypt = require("bcryptjs");
const User = require("../../src/models/userModel");
const orderModel = require("../../src/models/orderModel");
const TrainingConfig = require("../../src/models/trainingConfig");
env.config();

const DATABASE_URL = process.env.MONGODB_URL;
mongoose
    .connect(DATABASE_URL)
    .then(() => {
        console.log("DB connection successful ✅!");
    })
    .catch((err) => console.log(err));

const fileNames = ["drink", "rice"]

const readJSON = async (file) =>
    JSON.parse(await fs.readFile(path.join(__dirname, file), "utf-8"));

const importData = async () => {
    try {
        const users = [];

        const types = [
            {
                name: "Grocery",
                image: "https://thumbs.dreamstime.com/b/vegetables-shopping-cart-trolley-grocery-logo-icon-design-vector-171090350.jpg"
            },
            {
                name: "Foods",
                image: "https://www.myanmar-rice.com/images/ayeyarwaddy-rice.jpg"
            },
            {
                name: "Drinks",
                image: "https://www.myanmarpulse.com/images/ayeyarwaddy-beans.jpg"
            },
            {
                name: "Ayeyarwaddy Sesame",
                image: "https://www.myanmarsesame.com/images/ayeyarwaddy-sesame.jpg"
            },
            {
                name: "Ayeyarwaddy Fish",
                image: "https://www.myanmarfishery.com/images/ayeyarwaddy-fish.jpg"
            },
            {
                name: "Ayeyarwaddy Prawn",
                image: "https://www.myanmarfishery.com/images/ayeyarwaddy-prawn.jpg"
            },
            {
                name: "Ayeyarwaddy Crab",
                image: "https://www.myanmarfishery.com/images/ayeyarwaddy-crab.jpg"
            },
            {
                name: "Ayeyarwaddy Watermelon",
                image: "https://www.myanmarfruit.com/images/ayeyarwaddy-watermelon.jpg"
            },
            {
                name: "Ayeyarwaddy Banana",
                image: "https://www.myanmarfruit.com/images/ayeyarwaddy-banana.jpg"
            },
            {
                name: "Ayeyarwaddy Coconut",
                image: "https://www.myanmarfruit.com/images/ayeyarwaddy-coconut.jpg"
            },
            {
                name: "Ayeyarwaddy Mango",
                image: "https://www.myanmarfruit.com/images/ayeyarwaddy-mango.jpg"
            },
            {
                name: "Ayeyarwaddy Jaggery",
                image: "https://www.myanmarsugar.com/images/ayeyarwaddy-jaggery.jpg"
            },
            {
                name: "Ayeyarwaddy Palm Oil",
                image: "https://www.myanmarpalmoil.com/images/ayeyarwaddy-palmoil.jpg"
            },
            {
                name: "Ayeyarwaddy Salt",
                image: "https://www.myanmarsalt.com/images/ayeyarwaddy-salt.jpg"
            },
            {
                name: "Ayeyarwaddy Duck Egg",
                image: "https://www.myanmaregg.com/images/ayeyarwaddy-duckegg.jpg"
            }
        ];

        await Type.insertMany(types)

        const category = []
        for (const type of types) {
            for (let j = 0; j < 2; j++) {
                const cat = {
                    name: faker.commerce.department() + " " + faker.word.noun(),
                    description: faker.commerce.productDescription(),
                    image: faker.image.url(),
                    type: (await getTypeByName(type.name))._id
                };
                category.push(cat);
            }
        }
        await Category.insertMany(category);

        const password = await bcrypt.hash("password123", 12)

        for (let i = 0; i < 20; i++) {

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
        // console.log(user_array);

        await Promise.all(fileNames.map(async (name, i) => {
            // console.log(name);

            const products = await readJSON(`../products/${name}.json`);

            await Promise.all(products.map(async (product) => {

                const type = await getTypeByName(product.type);
                if (!type) {
                    return;
                }

                const category = await createOrConnectCategory(product.category, type._id)
                product.name = product.name.slice(0, 120)
                product.tags = await createOrConnectTag([type.name, "Local", "Myanmar", "Ayeyarwaddy Region", category.name])
                product.images = [product.image];
                product.merchant = user_array[i]._id;
                product.description = "This is a local product of Myanmar (Ayeyarwaddy Region). It is a high-quality product that is grown and harvested with care. The product is known for its freshness and taste, making it a popular choice among consumers.";
                product.status = "active";
                product.shipping = 1000;
                product.inventory = 30;
                product.price = 10000;
                product.category = category._id.toString();
                product.type = type._id.toString();
                product.isFeatured = Math.random() < 0.5;


                console.log(product);

                return product;
            }))


            console.log(products);



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
        await User.deleteMany()
        await Product.deleteMany();
        await Type.deleteMany()
        await Category.deleteMany()
        await orderModel.deleteMany()
        await TrainingConfig.deleteMany()
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
