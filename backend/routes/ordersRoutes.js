// backend/routes/ordersRoutes.js
// Orders + order items.
// The products and prices come from the Products page (products table).
// The backend calculates every price and total: the browser never decides them.
//
// In server.js, add this line AFTER the "const pool = new Pool(...)" block:
//   app.use("/api", require("./routes/ordersRoutes")(pool));

const express = require("express");

const ID_PATTERN = /^[1-9]\d*$/;
const STATUSES = ["pending", "preparing", "completed", "cancelled"];

// Allowed status changes. "completed" and "cancelled" are final.
const TRANSITIONS = {
    pending: ["preparing", "completed", "cancelled"],
    preparing: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
};

module.exports = function ordersRoutes(pool) {
    const router = express.Router();

    // Loads one order with its items
    async function loadOrder(db, id) {
        const order = await db.query(
            `SELECT order_id, status, note, total::float8 AS total, created_at, updated_at
             FROM orders WHERE order_id = $1`,
            [id]
        );
        if (!order.rows.length) return null;

        const items = await db.query(
            `SELECT order_item_id, product_id, product_name,
                    COALESCE(category, 'Other') AS category,
                    unit_price::float8 AS unit_price,
                    quantity,
                    line_total::float8 AS line_total
             FROM order_items
             WHERE order_id = $1
             ORDER BY order_item_id`,
            [id]
        );

        return { ...order.rows[0], items: items.rows };
    }

    // ---------- LIST ORDERS (optional ?status=&from=&to=&limit=) ----------
    router.get("/orders", async (req, res) => {
        const { status, from, to, scope } = req.query;
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const conditions = [];
        const values = [];

        // scope=current: only the orders created after the last daily closing
        if (scope !== undefined && !["current", "all"].includes(scope)) {
            return res.status(400).json({ message: "Scope must be current or all." });
        }
        if (scope === "current") {
            conditions.push(
                "o.created_at > (SELECT COALESCE(MAX(closed_at), '-infinity'::timestamp) FROM day_closings)"
            );
        }

        if (status !== undefined) {
            if (!STATUSES.includes(status)) {
                return res.status(400).json({ message: "Invalid status." });
            }
            values.push(status);
            conditions.push(`o.status = $${values.length}`);
        }
        if (from !== undefined) {
            values.push(from);
            conditions.push(`o.created_at >= $${values.length}::date`);
        }
        if (to !== undefined) {
            values.push(to);
            conditions.push(`o.created_at < ($${values.length}::date + INTERVAL '1 day')`);
        }

        values.push(limit);
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        try {
            const result = await pool.query(
                `SELECT
                    o.order_id,
                    o.status,
                    o.note,
                    o.total::float8 AS total,
                    o.created_at,
                    COALESCE(SUM(i.quantity), 0)::int AS item_count,
                    COALESCE(
                        ARRAY_AGG(DISTINCT COALESCE(i.category, 'Other')::text)
                            FILTER (WHERE i.order_item_id IS NOT NULL),
                        ARRAY[]::text[]
                    ) AS categories
                 FROM orders o
                 LEFT JOIN order_items i ON i.order_id = o.order_id
                 ${where}
                 GROUP BY o.order_id
                 ORDER BY o.created_at DESC, o.order_id DESC
                 LIMIT $${values.length}`,
                values
            );
            res.json(result.rows);
        } catch (error) {
            if (error.code === "22007" || error.code === "22008") {
                return res.status(400).json({ message: "Invalid date." });
            }
            console.error("Get orders:", error);
            res.status(500).json({ message: "Failed to load orders." });
        }
    });

    // ---------- GET ONE ORDER (with its items) ----------
    router.get("/orders/:id", async (req, res) => {
        const { id } = req.params;
        if (!ID_PATTERN.test(id)) {
            return res.status(400).json({ message: "Invalid order ID." });
        }

        try {
            const order = await loadOrder(pool, id);
            if (!order) {
                return res.status(404).json({ message: "Order not found." });
            }
            res.json(order);
        } catch (error) {
            console.error("Get order:", error);
            res.status(500).json({ message: "Failed to load the order." });
        }
    });

    // ---------- CREATE ORDER ----------
    // body: { items: [{ product_id, quantity }], note? }
    router.post("/orders", async (req, res) => {
        const { items, note } = req.body || {};

        if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
            return res.status(400).json({ message: "Add between 1 and 50 products to the order." });
        }

        // Check every line and merge duplicates of the same product
        const wanted = new Map();
        for (const item of items) {
            const productId = Number(item?.product_id);
            const quantity = Number(item?.quantity);

            if (!Number.isInteger(productId) || productId < 1) {
                return res.status(400).json({ message: "Invalid product in the order." });
            }
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
                return res.status(400).json({ message: "Each quantity must be a whole number from 1 to 100." });
            }
            wanted.set(productId, (wanted.get(productId) || 0) + quantity);
        }

        if ([...wanted.values()].some((q) => q > 100)) {
            return res.status(400).json({ message: "A product quantity cannot be more than 100." });
        }

        const cleanNote = typeof note === "string" ? note.trim().slice(0, 300) : "";

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // The real products and prices come from the database
            const found = await client.query(
                `SELECT id, name, COALESCE(category, 'Other') AS category,
                        price::float8 AS price, COALESCE(is_available, TRUE) AS is_available
                 FROM products
                 WHERE id = ANY($1::int[])`,
                [[...wanted.keys()]]
            );
            const products = new Map(found.rows.map((p) => [p.id, p]));

            for (const productId of wanted.keys()) {
                const product = products.get(productId);
                if (!product) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "A product in this order no longer exists." });
                }
                if (!product.is_available) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: `${product.name} is not available.` });
                }
            }

            // Totals are calculated in cents to avoid rounding errors
            let totalCents = 0;
            const lines = [];
            for (const [productId, quantity] of wanted) {
                const product = products.get(productId);
                const unitCents = Math.round(product.price * 100);
                const lineCents = unitCents * quantity;
                totalCents += lineCents;
                lines.push({
                    productId,
                    name: product.name,
                    category: product.category,
                    unitPrice: unitCents / 100,
                    quantity,
                    lineTotal: lineCents / 100,
                });
            }

            const created = await client.query(
                `INSERT INTO orders (status, note, total)
                 VALUES ('pending', $1, $2)
                 RETURNING order_id`,
                [cleanNote || null, totalCents / 100]
            );
            const orderId = created.rows[0].order_id;

            for (const line of lines) {
                await client.query(
                    `INSERT INTO order_items
                        (order_id, product_id, product_name, category, unit_price, quantity, line_total)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [orderId, line.productId, line.name, line.category, line.unitPrice, line.quantity, line.lineTotal]
                );
            }

            await client.query("COMMIT");

            res.status(201).json(await loadOrder(pool, orderId));
        } catch (error) {
            await client.query("ROLLBACK");
            console.error("Create order:", error);
            res.status(500).json({ message: "Failed to create the order." });
        } finally {
            client.release();
        }
    });

    // ---------- CHANGE ORDER STATUS ----------
    // body: { status }
    router.patch("/orders/:id/status", async (req, res) => {
        const { id } = req.params;
        const { status } = req.body || {};

        if (!ID_PATTERN.test(id)) {
            return res.status(400).json({ message: "Invalid order ID." });
        }
        if (!STATUSES.includes(status)) {
            return res.status(400).json({ message: "Invalid status." });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Lock the order so two requests cannot change it at the same time
            const current = await client.query(
                "SELECT status FROM orders WHERE order_id = $1 FOR UPDATE",
                [id]
            );
            if (!current.rows.length) {
                await client.query("ROLLBACK");
                return res.status(404).json({ message: "Order not found." });
            }

            const from = current.rows[0].status;
            if (!TRANSITIONS[from].includes(status)) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: `An order that is ${from} cannot become ${status}.`,
                });
            }

            await client.query(
                "UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2",
                [status, id]
            );

            await client.query("COMMIT");

            res.json(await loadOrder(pool, id));
        } catch (error) {
            await client.query("ROLLBACK");
            console.error("Update order status:", error);
            res.status(500).json({ message: "Failed to update the order status." });
        } finally {
            client.release();
        }
    });

    return router;
};