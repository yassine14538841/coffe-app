const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "coffee_management",
    password: process.env.DB_PASSWORD,
    port: 5432,
});

app.get("/", (req, res) => {
    res.json({
        message: "Coffee Management API is running ☕",
    });
});

app.get("/api/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json({
            message: "PostgreSQL connected successfully!",
            time: result.rows[0].now,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Database connection failed",
        });
    }
});
app.post("/api/login", async (req, res) => {
    try {
        const { email, password, role } = req.body;

            console.log("LOGIN REQUEST:");
            console.log("Email:", email);
            console.log("Role:", role);
            console.log("Password received:", password ? "YES" : "NO");

        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1 AND role = $2",
            [email, role]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email, password, or role"
            });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email, password, or role"
            });
        }

        res.json({
            message: "Login successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});
app.listen(5000, () => {
    console.log("Backend running on http://localhost:5000");
});
