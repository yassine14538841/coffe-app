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

async function test() {
    try {
        const result = await pool.query(
            "SELECT password, role FROM users WHERE email = $1",
            ["admin@coffee.com"]
        );

        console.log("User found:", result.rows.length);

        if (result.rows.length === 0) {
            return;
        }

        const passwordValid = await bcrypt.compare(
            "Admin123",
            result.rows[0].password
        );

        console.log("Role:", result.rows[0].role);
        console.log("Password valid:", passwordValid);

    } catch (error) {
        console.error(error);
    } finally {
        await pool.end();
    }
}

test();
