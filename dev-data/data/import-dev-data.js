const { faker } = require("@faker-js/faker");
const { Seller, User } = require("../../models/userModel");
const mongoose = require("mongoose");

const env = require("dotenv");
env.config();

const DATABASE_URL = process.env.MONGODB_URL;
mongoose
    .connect(DATABASE_URL)
    .then(() => {
        console.log("DB connection successful ✅!");
    })
    .catch((err) => console.log(err));


const importData = async () => {
    try {
        const users = [];

        for (let i = 0; i < 6; i++) {

            const userData = {
                name: faker.internet.username(),
                email: faker.internet.email(),
                role: "seller",
                password: "Test123!",
                passwordConfirm: "Test123!",
                phone: faker.phone.number(),
                active: 1,
                address: {
                    street: faker.location.streetAddress(),
                    city: faker.location.city(),
                    state: faker.location.state(),
                    country: faker.location.country(),
                    postalCode: faker.location.zipCode(),
                },
                description: faker.lorem.paragraph(),
                NRCNumber: faker.number.int(),
                NRCPhoto: faker.image.url(),
                balance: 100,
                rating: 5,
                logo: faker.image.url()
            };

            users.push(userData);
        }

        await Seller.insertMany(users);
        console.log(`Successfully seeded ${users.length} users`);
    } catch (err) {
        console.error("Error inserting data:", err);
    } finally {
        process.exit();
    }
};

// DELETE ALL DATA FROM DB
const deleteData = async () => {
    try {


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
