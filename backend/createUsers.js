const bcrypt = require("bcrypt");
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "coffee_management",
    password: process.env.DB_PASSWORD,
    port: 5432,
});

async function createUsers() {
    try {
        const adminPassword = await bcrypt.hash("Admin123", 10);
        const employeePassword = await bcrypt.hash("Employee123", 10);

        await pool.query(
            `INSERT INTO users (name, email, password, role)
             VALUES ($1, $2, $3, $4)`,
            ["Admin", "admin@coffee.com", adminPassword, "admin"]
        );

        await pool.query(
            `INSERT INTO users (name, email, password, role)
             VALUES ($1, $2, $3, $4)`,
            ["Employee", "employee@coffee.com", employeePassword, "employee"]
        );

        console.log("Users created successfully!");

    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}

createUsers();