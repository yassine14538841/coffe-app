
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/emails", require("./routes/emailRoutes"));

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "coffee_management",
    password: process.env.DB_PASSWORD,
    port: 5432,
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL error:", error);
});
//adding routes links
app.use("/api", require("./routes/inventoryRoutes")(pool));
app.use("/api", require("./routes/ordersRoutes")(pool));
app.use("/api", require("./routes/reportsRoutes")(pool));
app.use("/api", require("./routes/closingsRoutes")(pool));
// ================================
// HOME
// ================================

app.get("/", (req, res) => {
    res.json({
        message: "Coffee Management API is running ☕",
    });
});

// ================================
// TEST DATABASE CONNECTION
// ================================

app.get("/api/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            message: "PostgreSQL connected successfully!",
            time: result.rows[0].now,
        });
    } catch (error) {
        console.error("Database connection error:", error);

        res.status(500).json({
            message: "Database connection failed",
        });
    }
});

// ================================
// LOGIN
// ================================

app.post("/api/login", async (req, res) => {
    try {
        const { email, password, role } = req.body;

        if (!email || !password || !role) {
            return res.status(400).json({
                message: "Email, password and role are required.",
            });
        }

        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1 AND role = $2",
            [email, role]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email, password, or role",
            });
        }

        const user = result.rows[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email, password, or role",
            });
        }

        res.json({
            message: "Login successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            message: "Server error",
        });
    }
});

// ================================
// GET ALL PRODUCTS
// ================================

app.get("/api/products", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM products ORDER BY id DESC"
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error loading products:", error);

        res.status(500).json({
            message: "Failed to load products",
        });
    }
});

// ================================
// ADD PRODUCT
// ================================

app.post("/api/products", async (req, res) => {
    try {
        const { name, description, price, category } = req.body;

        if (
            typeof name !== "string" ||
            !name.trim() ||
            name.trim().length > 100
        ) {
            return res.status(400).json({
                message: "Product name is required (maximum 100 characters).",
            });
        }

        if (
            price === "" ||
            price === null ||
            price === undefined ||
            !Number.isFinite(Number(price)) ||
            Number(price) < 0
        ) {
            return res.status(400).json({
                message: "Please enter a valid, non-negative price.",
            });
        }

        if (description != null && typeof description !== "string") {
            return res.status(400).json({
                message: "Description must be text.",
            });
        }

        if (category != null && typeof category !== "string") {
            return res.status(400).json({
                message: "Category must be text.",
            });
        }

        const result = await pool.query(
            `INSERT INTO products
                (name, description, price, category)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [
                name.trim(),
                description?.trim() || null,
                Number(price),
                category?.trim() || "Other",
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                message: "A product with this name already exists.",
            });
        }

        console.error("Error creating product:", error);

        res.status(500).json({
            message: "Failed to create product",
        });
    }
});

// ================================
// UPDATE PRODUCT AVAILABILITY
// ================================

app.patch("/api/products/:id/availability", async (req, res) => {
    try {
        const { id } = req.params;
        const { is_available } = req.body;

        if (!/^\d+$/.test(id) || Number(id) < 1) {
            return res.status(400).json({
                message: "Invalid product ID.",
            });
        }

        if (typeof is_available !== "boolean") {
            return res.status(400).json({
                message: "is_available must be true or false.",
            });
        }

        const result = await pool.query(
            `UPDATE products
             SET is_available = $1
             WHERE id = $2
             RETURNING *`,
            [is_available, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Product not found.",
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating product availability:", error);

        res.status(500).json({
            message: "Failed to update product availability",
        });
    }
});


/* =========================
   PRODUCT RECIPES
========================= */

// GET a product's recipe
app.get("/api/products/:id/recipe", async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^\d+$/.test(id) || Number(id) < 1) {
            return res.status(400).json({ message: "Invalid product ID." });
        }

        const product = await pool.query(
            "SELECT id FROM products WHERE id = $1",
            [id]
        );

        if (product.rows.length === 0) {
            return res.status(404).json({ message: "Product not found." });
        }

        const result = await pool.query(
            "SELECT * FROM product_recipes WHERE product_id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            return res.json({
                product_id: Number(id),
                recipe_structure: [],
                updated_at: null
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error loading recipe:", error);
        res.status(500).json({ message: "Failed to load recipe." });
    }
});

// SAVE or UPDATE a product's recipe
app.put("/api/products/:id/recipe", async (req, res) => {
    try {
        const { id } = req.params;
        const { recipe_structure } = req.body;

        if (!/^\d+$/.test(id) || Number(id) < 1) {
            return res.status(400).json({ message: "Invalid product ID." });
        }

        if (!Array.isArray(recipe_structure)) {
            return res.status(400).json({
                message: "recipe_structure must be an array."
            });
        }

        const product = await pool.query(
            "SELECT id FROM products WHERE id = $1",
            [id]
        );

        if (product.rows.length === 0) {
            return res.status(404).json({ message: "Product not found." });
        }

        const result = await pool.query(
            `INSERT INTO product_recipes (product_id, recipe_structure)
             VALUES ($1, $2::jsonb)
             ON CONFLICT (product_id)
             DO UPDATE SET
                recipe_structure = EXCLUDED.recipe_structure,
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [id, JSON.stringify(recipe_structure)]
        );

        res.json({
            message: "Recipe saved successfully.",
            recipe: result.rows[0]
        });
    } catch (error) {
        console.error("Error saving recipe:", error);
        res.status(500).json({ message: "Failed to save recipe." });
    }
});



// ================================
// DELETE PRODUCT
// ================================

app.delete("/api/products/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^\d+$/.test(id) || Number(id) < 1) {
            return res.status(400).json({
                message: "Invalid product ID.",
            });
        }

        const result = await pool.query(
            "DELETE FROM products WHERE id = $1 RETURNING id",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Product not found.",
            });
        }

        res.json({
            message: "Product deleted successfully.",
        });
    } catch (error) {
        console.error("Error deleting product:", error);

        res.status(500).json({
            message: "Failed to delete product",
        });
    }
});

// ================================
// START SERVER
// ================================

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});

/* =====================================================
   STAFF MANAGEMENT API
===================================================== */

// GET ALL EMPLOYEES
app.get("/api/employees", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *
            FROM employees
            ORDER BY employee_id DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Get employees:", error);
        res.status(500).json({ message: "Failed to load employees." });
    }
});

// GET ONE EMPLOYEE
app.get("/api/employees/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({ message: "Invalid employee ID." });
        }

        const result = await pool.query(
            "SELECT * FROM employees WHERE employee_id = $1",
            [id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ message: "Employee not found." });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Get employee:", error);
        res.status(500).json({ message: "Failed to load employee." });
    }
});

// ADD EMPLOYEE
app.post("/api/employees", async (req, res) => {
    try {
        const {
            first_name, last_name, email, phone,
            job_title, salary, hire_date, status
        } = req.body;

        if (
            typeof first_name !== "string" || !first_name.trim() ||
            typeof last_name !== "string" || !last_name.trim() ||
            typeof job_title !== "string" || !job_title.trim()
        ) {
            return res.status(400).json({
                message: "First name, last name and job title are required."
            });
        }

        if (
            salary !== undefined &&
            (salary === "" || !Number.isFinite(Number(salary)) || Number(salary) < 0)
        ) {
            return res.status(400).json({ message: "Invalid salary." });
        }

        const employeeStatus = status || "active";
        if (!["active", "inactive"].includes(employeeStatus)) {
            return res.status(400).json({ message: "Invalid employee status." });
        }

        const result = await pool.query(`
            INSERT INTO employees
                (first_name, last_name, email, phone, job_title,
                 salary, hire_date, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            first_name.trim(),
            last_name.trim(),
            email?.trim() || null,
            phone?.trim() || null,
            job_title.trim(),
            salary === undefined || salary === "" ? 0 : Number(salary),
            hire_date || null,
            employeeStatus
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({ message: "This email is already used." });
        }
        if (error.code === "22007" || error.code === "22008") {
            return res.status(400).json({ message: "Invalid date format." });
        }
        console.error("Add employee:", error);
        res.status(500).json({ message: "Failed to add employee." });
    }
});

// UPDATE EMPLOYEE
app.put("/api/employees/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({ message: "Invalid employee ID." });
        }

        const {
            first_name, last_name, email, phone,
            job_title, salary, hire_date, status
        } = req.body;

        if (
            typeof first_name !== "string" || !first_name.trim() ||
            typeof last_name !== "string" || !last_name.trim() ||
            typeof job_title !== "string" || !job_title.trim()
        ) {
            return res.status(400).json({
                message: "First name, last name and job title are required."
            });
        }

        if (
            salary === "" || salary === undefined ||
            !Number.isFinite(Number(salary)) || Number(salary) < 0
        ) {
            return res.status(400).json({ message: "A valid salary is required." });
        }

        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({ message: "Invalid employee status." });
        }

        const result = await pool.query(`
            UPDATE employees
            SET first_name = $1,
                last_name = $2,
                email = $3,
                phone = $4,
                job_title = $5,
                salary = $6,
                hire_date = $7,
                status = $8
            WHERE employee_id = $9
            RETURNING *
        `, [
            first_name.trim(), last_name.trim(),
            email?.trim() || null, phone?.trim() || null,
            job_title.trim(), Number(salary),
            hire_date || null, status, id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Employee not found." });
        }

        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({ message: "This email is already used." });
        }
        console.error("Update employee:", error);
        res.status(500).json({ message: "Failed to update employee." });
    }
});

// DELETE EMPLOYEE
app.delete("/api/employees/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({ message: "Invalid employee ID." });
        }

        const result = await pool.query(
            "DELETE FROM employees WHERE employee_id = $1 RETURNING employee_id",
            [id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ message: "Employee not found." });
        }

        res.json({ message: "Employee deleted successfully." });
    } catch (error) {
        console.error("Delete employee:", error);
        res.status(500).json({ message: "Failed to delete employee." });
    }
});


/* =====================================================
   STAFF SCHEDULE / SHIFTS API
===================================================== */

// GET SHIFTS (optional filters: employee_id, date, from, to)
app.get("/api/shifts", async (req, res) => {
    try {
        const { employee_id, date, from, to } = req.query;
        const conditions = [];
        const values = [];

        if (employee_id !== undefined) {
            if (!/^[1-9]\d*$/.test(employee_id)) {
                return res.status(400).json({ message: "Invalid employee ID." });
            }
            values.push(employee_id);
            conditions.push(`s.employee_id = $${values.length}`);
        }

        if (date !== undefined) {
            values.push(date);
            conditions.push(`s.shift_date = $${values.length}::date`);
        }

        if (from !== undefined) {
            values.push(from);
            conditions.push(`s.shift_date >= $${values.length}::date`);
        }

        if (to !== undefined) {
            values.push(to);
            conditions.push(`s.shift_date <= $${values.length}::date`);
        }

        const where = conditions.length
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

        const result = await pool.query(`
                    SELECT
            s.shift_id,
            s.employee_id,
            TO_CHAR(s.shift_date, 'YYYY-MM-DD') AS shift_date,
            s.start_time,
            s.end_time,
            s.role,
            s.notes,
            s.status,
            s.created_at,
            e.first_name,
            e.last_name,
            e.job_title
        FROM shifts AS s
        JOIN employees AS e
            ON e.employee_id = s.employee_id
            ${where}
            ORDER BY s.shift_date, s.start_time
        `, values);

        res.json(result.rows);
    } catch (error) {
        console.error("Get shifts:", error);
        res.status(500).json({ message: "Failed to load shifts." });
    }
});


 // CREATE SHIFT — create or replace an employee's shift for a date
app.post("/api/shifts", async (req, res) => {
    try {
        const {
            employee_id,
            shift_date,
            start_time,
            end_time,
            role,
            notes
        } = req.body;

        if (
            !Number.isInteger(Number(employee_id)) ||
            Number(employee_id) < 1 ||
            !shift_date ||
            !start_time ||
            !end_time
        ) {
            return res.status(400).json({
                message: "Employee, date, start time and end time are required."
            });
        }

        if (end_time <= start_time) {
            return res.status(400).json({
                message: "End time must be later than start time."
            });
        }

        const result = await pool.query(`
            INSERT INTO shifts
                (employee_id, shift_date, start_time, end_time, role, notes)
            VALUES ($1, $2::date, $3, $4, $5, $6)
            ON CONFLICT (employee_id, shift_date)
            DO UPDATE SET
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                role = EXCLUDED.role,
                notes = EXCLUDED.notes,
                status = 'scheduled'
            RETURNING *
        `, [
            Number(employee_id),
            shift_date,
            start_time,
            end_time,
            role?.trim() || null,
            notes?.trim() || null
        ]);

        res.status(200).json(result.rows[0]);

    } catch (error) {
        if (error.code === "23503") {
            return res.status(400).json({
                message: "Employee does not exist."
            });
        }

        if (error.code === "23505") {
            return res.status(409).json({
                message: "A conflicting shift already exists."
            });
        }

        if (
            error.code === "23514" ||
            error.code === "22007" ||
            error.code === "22008"
        ) {
            return res.status(400).json({
                message: "Invalid shift date or times."
            });
        }

        console.error("Create/update shift:", error);
        res.status(500).json({
            message: "Failed to create or update shift."
        });
    }
});

// UPDATE SHIFT
app.put("/api/shifts/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const {
            employee_id, shift_date, start_time,
            end_time, role, notes, status
        } = req.body;

        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({ message: "Invalid shift ID." });
        }

        if (
            !Number.isInteger(Number(employee_id)) || Number(employee_id) < 1 ||
            !shift_date || !start_time || !end_time ||
            end_time <= start_time ||
            !["scheduled", "completed", "cancelled"].includes(status)
        ) {
            return res.status(400).json({ message: "Invalid shift information." });
        }

        const result = await pool.query(`
            UPDATE shifts
            SET employee_id = $1, shift_date = $2,
                start_time = $3, end_time = $4,
                role = $5, notes = $6, status = $7
            WHERE shift_id = $8
            RETURNING *
        `, [
            Number(employee_id), shift_date, start_time,
            end_time, role?.trim() || null, notes?.trim() || null,
            status, id
        ]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Shift not found." });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Update shift:", error);
        res.status(500).json({ message: "Failed to update shift." });
    }
});

// DELETE SHIFT
app.delete("/api/shifts/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({ message: "Invalid shift ID." });
        }

        const result = await pool.query(
            "DELETE FROM shifts WHERE shift_id = $1 RETURNING shift_id",
            [id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ message: "Shift not found." });
        }

        res.json({ message: "Shift deleted successfully." });
    } catch (error) {
        console.error("Delete shift:", error);
        res.status(500).json({ message: "Failed to delete shift." });
    }
});


/* =====================================================
   STAFF ABSENCES API
===================================================== */

// GET ABSENCES (optional filter: employee_id)
app.get("/api/absences", async (req, res) => {
    try {
        const { employee_id } = req.query;
        let result;

        if (employee_id !== undefined) {
            if (!/^[1-9]\d*$/.test(employee_id)) {
                return res.status(400).json({ message: "Invalid employee ID." });
            }

            result = await pool.query(`
                SELECT a.*, e.first_name, e.last_name
                FROM staff_absences a
                JOIN employees e ON e.employee_id = a.employee_id
                WHERE a.employee_id = $1
                ORDER BY a.start_date DESC
            `, [employee_id]);
        } else {
            result = await pool.query(`
                SELECT a.*, e.first_name, e.last_name
                FROM staff_absences a
                JOIN employees e ON e.employee_id = a.employee_id
                ORDER BY a.start_date DESC
            `);
        }

        res.json(result.rows);
    } catch (error) {
        console.error("Get absences:", error);
        res.status(500).json({ message: "Failed to load absences." });
    }
});

// CREATE ABSENCE REQUEST
app.post("/api/absences", async (req, res) => {
    try {
        const { employee_id, start_date, end_date, reason } = req.body;

        if (
            !Number.isInteger(Number(employee_id)) || Number(employee_id) < 1 ||
            !start_date || !end_date || end_date < start_date
        ) {
            return res.status(400).json({
                message: "Valid employee and absence dates are required."
            });
        }

        const result = await pool.query(`
            INSERT INTO staff_absences
                (employee_id, start_date, end_date, reason)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [
            Number(employee_id), start_date, end_date,
            typeof reason === "string" ? reason.trim() || null : null
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === "23503") {
            return res.status(400).json({ message: "Employee does not exist." });
        }
        console.error("Create absence:", error);
        res.status(500).json({ message: "Failed to create absence." });
    }
});

// UPDATE ABSENCE APPROVAL STATUS
app.patch("/api/absences/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({ message: "Invalid absence ID." });
        }

        if (!["pending", "approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Invalid absence status." });
        }

        const result = await pool.query(`
            UPDATE staff_absences
            SET status = $1
            WHERE absence_id = $2
            RETURNING *
        `, [status, id]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Absence not found." });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Update absence:", error);
        res.status(500).json({ message: "Failed to update absence." });
    }
});
