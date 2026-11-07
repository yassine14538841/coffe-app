// backend/routes/reportsRoutes.js
// Reports calculated from the real records in the database:
// orders, order items, stock movements, shifts and absences.
//
// Rules:
//  - Only COMPLETED orders count as sales (revenue).
//  - Revenue is NOT profit. Profit needs expenses, which are not recorded yet.
//
// In server.js, add this line AFTER the "const pool = new Pool(...)" block:
//   app.use("/api", require("./routes/reportsRoutes")(pool));

const express = require("express");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GROUP_UNITS = { day: "day", week: "week", month: "month" };

// Checks ?from=YYYY-MM-DD&to=YYYY-MM-DD (both days included)
function parseRange(query) {
    const { from, to } = query;

    if (!DATE_PATTERN.test(from || "") || !DATE_PATTERN.test(to || "")) {
        return { error: "Both dates are required (YYYY-MM-DD)." };
    }

    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);

    if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        start.toISOString().slice(0, 10) !== from ||
        end.toISOString().slice(0, 10) !== to
    ) {
        return { error: "Invalid date." };
    }
    if (end < start) {
        return { error: "The end date cannot be before the start date." };
    }
    if ((end - start) / 86400000 > 366) {
        return { error: "The date range cannot be longer than one year." };
    }

    return { from, to };
}

module.exports = function reportsRoutes(pool) {
    const router = express.Router();

    // Orders created between $1 and $2 (both days included)
    const ORDER_RANGE =
        "o.created_at >= $1::date AND o.created_at < ($2::date + INTERVAL '1 day')";

    // ---------- SALES: summary + one row per day / week / month ----------
    router.get("/reports/sales", async (req, res) => {
        const range = parseRange(req.query);
        if (range.error) return res.status(400).json({ message: range.error });

        const unit = GROUP_UNITS[req.query.group || "day"];
        if (!unit) return res.status(400).json({ message: "Group must be day, week or month." });

        try {
            const summary = await pool.query(
                `SELECT
                    COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed_orders,
                    COALESCE(SUM(o.total) FILTER (WHERE o.status = 'completed'), 0)::float8 AS revenue,
                    COUNT(*) FILTER (WHERE o.status IN ('pending', 'preparing'))::int AS open_orders,
                    COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_orders
                 FROM orders o
                 WHERE ${ORDER_RANGE}`,
                [range.from, range.to]
            );

            const series = await pool.query(
                `SELECT
                    TO_CHAR(DATE_TRUNC('${unit}', o.created_at), 'YYYY-MM-DD') AS period,
                    COUNT(*)::int AS orders,
                    SUM(o.total)::float8 AS revenue
                 FROM orders o
                 WHERE o.status = 'completed' AND ${ORDER_RANGE}
                 GROUP BY 1
                 ORDER BY 1`,
                [range.from, range.to]
            );

            const row = summary.rows[0];
            res.json({
                summary: {
                    ...row,
                    average_order: row.completed_orders > 0 ? row.revenue / row.completed_orders : 0,
                },
                series: series.rows,
            });
        } catch (error) {
            console.error("Sales report:", error);
            res.status(500).json({ message: "Failed to load the sales report." });
        }
    });

    // ---------- BEST-SELLING PRODUCTS ----------
    router.get("/reports/products", async (req, res) => {
        const range = parseRange(req.query);
        if (range.error) return res.status(400).json({ message: range.error });

        try {
            const result = await pool.query(
                `SELECT
                    i.product_name,
                    COALESCE(i.category, 'Other') AS category,
                    SUM(i.quantity)::int AS quantity,
                    SUM(i.line_total)::float8 AS revenue
                 FROM order_items i
                 JOIN orders o ON o.order_id = i.order_id
                 WHERE o.status = 'completed' AND ${ORDER_RANGE}
                 GROUP BY i.product_name, COALESCE(i.category, 'Other')
                 ORDER BY quantity DESC, revenue DESC
                 LIMIT 15`,
                [range.from, range.to]
            );
            res.json(result.rows);
        } catch (error) {
            console.error("Products report:", error);
            res.status(500).json({ message: "Failed to load the products report." });
        }
    });

    // ---------- SALES BY CATEGORY ----------
    router.get("/reports/categories", async (req, res) => {
        const range = parseRange(req.query);
        if (range.error) return res.status(400).json({ message: range.error });

        try {
            const result = await pool.query(
                `SELECT
                    COALESCE(i.category, 'Other') AS category,
                    SUM(i.quantity)::int AS quantity,
                    SUM(i.line_total)::float8 AS revenue
                 FROM order_items i
                 JOIN orders o ON o.order_id = i.order_id
                 WHERE o.status = 'completed' AND ${ORDER_RANGE}
                 GROUP BY COALESCE(i.category, 'Other')
                 ORDER BY revenue DESC`,
                [range.from, range.to]
            );
            res.json(result.rows);
        } catch (error) {
            console.error("Categories report:", error);
            res.status(500).json({ message: "Failed to load the categories report." });
        }
    });

    // ---------- INVENTORY MOVEMENTS (one row per ingredient) ----------
    router.get("/reports/inventory", async (req, res) => {
        const range = parseRange(req.query);
        if (range.error) return res.status(400).json({ message: range.error });

        try {
            const result = await pool.query(
                `SELECT
                    g.ingredient_id,
                    g.name,
                    g.unit,
                    g.current_stock::float8 AS current_stock,
                    g.min_stock::float8 AS min_stock,
                    CASE
                        WHEN g.current_stock <= 0 THEN 'out'
                        WHEN g.current_stock <= g.min_stock THEN 'low'
                        ELSE 'ok'
                    END AS stock_status,
                    COALESCE(SUM(m.quantity_change)
                        FILTER (WHERE m.movement_type IN ('initial', 'addition', 'delivery')), 0)::float8 AS added,
                    COALESCE(-SUM(m.quantity_change)
                        FILTER (WHERE m.movement_type = 'order_use'), 0)::float8 AS used,
                    COALESCE(SUM(m.quantity_change)
                        FILTER (WHERE m.movement_type = 'adjustment'), 0)::float8 AS adjusted
                 FROM ingredients g
                 LEFT JOIN stock_movements m
                    ON m.ingredient_id = g.ingredient_id
                   AND m.created_at >= $1::date
                   AND m.created_at < ($2::date + INTERVAL '1 day')
                 GROUP BY g.ingredient_id
                 ORDER BY LOWER(g.name)`,
                [range.from, range.to]
            );
            res.json(result.rows);
        } catch (error) {
            console.error("Inventory report:", error);
            res.status(500).json({ message: "Failed to load the inventory report." });
        }
    });

    // ---------- STAFF: scheduled hours and approved absence days ----------
    router.get("/reports/staff", async (req, res) => {
        const range = parseRange(req.query);
        if (range.error) return res.status(400).json({ message: range.error });

        try {
            const result = await pool.query(
                `SELECT
                    e.employee_id,
                    e.first_name,
                    e.last_name,
                    e.job_title,
                    COALESCE(s.shifts, 0)::int AS shifts,
                    COALESCE(s.hours, 0)::float8 AS hours,
                    COALESCE(a.days, 0)::int AS absence_days
                 FROM employees e
                 LEFT JOIN (
                    SELECT employee_id,
                           COUNT(*) AS shifts,
                           SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) AS hours
                    FROM shifts
                    WHERE shift_date BETWEEN $1::date AND $2::date
                      AND status <> 'cancelled'
                    GROUP BY employee_id
                 ) s ON s.employee_id = e.employee_id
                 LEFT JOIN (
                    SELECT employee_id,
                           SUM(LEAST(end_date::date, $2::date) - GREATEST(start_date::date, $1::date) + 1) AS days
                    FROM staff_absences
                    WHERE status = 'approved'
                      AND start_date::date <= $2::date
                      AND end_date::date >= $1::date
                    GROUP BY employee_id
                 ) a ON a.employee_id = e.employee_id
                 ORDER BY e.first_name, e.last_name`,
                [range.from, range.to]
            );
            res.json(result.rows);
        } catch (error) {
            console.error("Staff report:", error);
            res.status(500).json({ message: "Failed to load the staff report." });
        }
    });

    return router;
};