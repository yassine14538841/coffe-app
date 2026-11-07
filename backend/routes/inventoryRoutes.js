// backend/routes/inventoryRoutes.js
// Ingredients + stock movements.
// Stock quantity changes ONLY through a movement (with a reason), so every
// change is confirmed by the admin and kept in the history.

const express = require("express");

const UNITS = ["g", "kg", "ml", "l", "pcs"];
const ID_PATTERN = /^[1-9]\d*$/;

function toNumber(value) {
    if (value === "" || value === null || value === undefined) return NaN;
    return Number(value);
}

module.exports = function inventoryRoutes(pool) {
    const router = express.Router();

    // Ingredient row with a computed status: ok / low / out
    const SELECT_INGREDIENT = `
        SELECT
            ingredient_id,
            name,
            unit,
            current_stock::float8 AS current_stock,
            min_stock::float8     AS min_stock,
            CASE
                WHEN current_stock <= 0         THEN 'out'
                WHEN current_stock <= min_stock THEN 'low'
                ELSE 'ok'
            END AS stock_status,
            created_at,
            updated_at
        FROM ingredients
    `;

    // ---------- GET ALL INGREDIENTS ----------
    router.get("/ingredients", async (req, res) => {
        try {
            const result = await pool.query(`${SELECT_INGREDIENT} ORDER BY LOWER(name)`);
            res.json(result.rows);
        } catch (error) {
            console.error("Get ingredients:", error);
            res.status(500).json({ message: "Failed to load ingredients." });
        }
    });

    // ---------- ADD INGREDIENT (with its starting stock) ----------
    router.post("/ingredients", async (req, res) => {
        const { name, unit } = req.body || {};
        const stock = req.body?.current_stock === undefined ? 0 : toNumber(req.body.current_stock);
        const minimum = req.body?.min_stock === undefined ? 0 : toNumber(req.body.min_stock);

        if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
            return res.status(400).json({ message: "Ingredient name is required (maximum 100 characters)." });
        }
        if (!UNITS.includes(unit)) {
            return res.status(400).json({ message: "Unit must be one of: " + UNITS.join(", ") + "." });
        }
        if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(minimum) || minimum < 0) {
            return res.status(400).json({ message: "Stock and minimum stock must be 0 or more." });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const created = await client.query(
                `INSERT INTO ingredients (name, unit, current_stock, min_stock)
                 VALUES ($1, $2, $3, $4)
                 RETURNING ingredient_id`,
                [name.trim(), unit, stock, minimum]
            );
            const id = created.rows[0].ingredient_id;

            if (stock > 0) {
                await client.query(
                    `INSERT INTO stock_movements
                        (ingredient_id, movement_type, quantity_change, stock_after, reason)
                     VALUES ($1, 'initial', $2, $2, 'Starting stock')`,
                    [id, stock]
                );
            }

            await client.query("COMMIT");

            const row = await pool.query(`${SELECT_INGREDIENT} WHERE ingredient_id = $1`, [id]);
            res.status(201).json(row.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            if (error.code === "23505") {
                return res.status(409).json({ message: "An ingredient with this name already exists." });
            }
            console.error("Add ingredient:", error);
            res.status(500).json({ message: "Failed to add ingredient." });
        } finally {
            client.release();
        }
    });

    // ---------- EDIT INGREDIENT DETAILS (name, unit, minimum) ----------
    // The stock quantity is NOT changed here. Use a movement instead.
    router.put("/ingredients/:id", async (req, res) => {
        const { id } = req.params;
        const { name, unit } = req.body || {};
        const minimum = toNumber(req.body?.min_stock);

        if (!ID_PATTERN.test(id)) {
            return res.status(400).json({ message: "Invalid ingredient ID." });
        }
        if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
            return res.status(400).json({ message: "Ingredient name is required (maximum 100 characters)." });
        }
        if (!UNITS.includes(unit)) {
            return res.status(400).json({ message: "Unit must be one of: " + UNITS.join(", ") + "." });
        }
        if (!Number.isFinite(minimum) || minimum < 0) {
            return res.status(400).json({ message: "Minimum stock must be 0 or more." });
        }

        try {
            const result = await pool.query(
                `UPDATE ingredients
                 SET name = $1, unit = $2, min_stock = $3, updated_at = CURRENT_TIMESTAMP
                 WHERE ingredient_id = $4
                 RETURNING ingredient_id`,
                [name.trim(), unit, minimum, id]
            );
            if (!result.rows.length) {
                return res.status(404).json({ message: "Ingredient not found." });
            }
            const row = await pool.query(`${SELECT_INGREDIENT} WHERE ingredient_id = $1`, [id]);
            res.json(row.rows[0]);
        } catch (error) {
            if (error.code === "23505") {
                return res.status(409).json({ message: "An ingredient with this name already exists." });
            }
            console.error("Update ingredient:", error);
            res.status(500).json({ message: "Failed to update ingredient." });
        }
    });

    // ---------- DELETE INGREDIENT (its movement history is deleted too) ----------
    router.delete("/ingredients/:id", async (req, res) => {
        const { id } = req.params;
        if (!ID_PATTERN.test(id)) {
            return res.status(400).json({ message: "Invalid ingredient ID." });
        }
        try {
            const result = await pool.query(
                "DELETE FROM ingredients WHERE ingredient_id = $1 RETURNING ingredient_id",
                [id]
            );
            if (!result.rows.length) {
                return res.status(404).json({ message: "Ingredient not found." });
            }
            res.json({ message: "Ingredient deleted successfully." });
        } catch (error) {
            console.error("Delete ingredient:", error);
            res.status(500).json({ message: "Failed to delete ingredient." });
        }
    });

    // ---------- CHANGE STOCK ----------
    // type "addition":   { type, quantity (> 0), reason? }   adds to the stock
    // type "adjustment": { type, new_stock (>= 0), reason }  sets the stock to the counted value
    router.post("/ingredients/:id/movements", async (req, res) => {
        const { id } = req.params;
        const { type, reason } = req.body || {};
        const cleanReason = typeof reason === "string" ? reason.trim() : "";

        if (!ID_PATTERN.test(id)) {
            return res.status(400).json({ message: "Invalid ingredient ID." });
        }
        if (!["addition", "adjustment"].includes(type)) {
            return res.status(400).json({ message: "Movement type must be addition or adjustment." });
        }

        let quantity = NaN;
        let newStock = NaN;

        if (type === "addition") {
            quantity = toNumber(req.body.quantity);
            if (!Number.isFinite(quantity) || quantity <= 0) {
                return res.status(400).json({ message: "Quantity to add must be greater than 0." });
            }
        } else {
            newStock = toNumber(req.body.new_stock);
            if (!Number.isFinite(newStock) || newStock < 0) {
                return res.status(400).json({ message: "The new stock must be 0 or more." });
            }
            if (!cleanReason) {
                return res.status(400).json({ message: "A reason is required for an adjustment." });
            }
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Lock the row so two requests cannot change the same stock at once
            const current = await client.query(
                "SELECT current_stock::float8 AS current_stock FROM ingredients WHERE ingredient_id = $1 FOR UPDATE",
                [id]
            );
            if (!current.rows.length) {
                await client.query("ROLLBACK");
                return res.status(404).json({ message: "Ingredient not found." });
            }

            const before = current.rows[0].current_stock;
            const after = type === "addition" ? before + quantity : newStock;
            const change = after - before;

            if (change === 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "The stock is already at this quantity." });
            }

            await client.query(
                "UPDATE ingredients SET current_stock = $1, updated_at = CURRENT_TIMESTAMP WHERE ingredient_id = $2",
                [after, id]
            );
            await client.query(
                `INSERT INTO stock_movements
                    (ingredient_id, movement_type, quantity_change, stock_after, reason)
                 VALUES ($1, $2, $3, $4, $5)`,
                [id, type, change, after, cleanReason || null]
            );

            await client.query("COMMIT");

            const row = await pool.query(`${SELECT_INGREDIENT} WHERE ingredient_id = $1`, [id]);
            res.status(201).json(row.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            console.error("Stock movement:", error);
            res.status(500).json({ message: "Failed to save the stock change." });
        } finally {
            client.release();
        }
    });

    // ---------- MOVEMENT HISTORY (optional ?ingredient_id=&limit=) ----------
    router.get("/stock-movements", async (req, res) => {
        const { ingredient_id } = req.query;
        const limit = Math.min(Number(req.query.limit) || 100, 500);

        if (ingredient_id !== undefined && !ID_PATTERN.test(ingredient_id)) {
            return res.status(400).json({ message: "Invalid ingredient ID." });
        }

        try {
            const values = [];
            let where = "";
            if (ingredient_id !== undefined) {
                values.push(ingredient_id);
                where = "WHERE m.ingredient_id = $1";
            }
            values.push(limit);

            const result = await pool.query(
                `SELECT
                    m.movement_id,
                    m.ingredient_id,
                    i.name AS ingredient_name,
                    i.unit,
                    m.movement_type,
                    m.quantity_change::float8 AS quantity_change,
                    m.stock_after::float8     AS stock_after,
                    m.reason,
                    m.created_at
                 FROM stock_movements m
                 JOIN ingredients i ON i.ingredient_id = m.ingredient_id
                 ${where}
                 ORDER BY m.created_at DESC, m.movement_id DESC
                 LIMIT $${values.length}`,
                values
            );
            res.json(result.rows);
        } catch (error) {
            console.error("Get stock movements:", error);
            res.status(500).json({ message: "Failed to load stock movements." });
        }
    });

    return router;
};
