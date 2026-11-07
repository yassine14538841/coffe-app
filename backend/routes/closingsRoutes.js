// backend/routes/closingsRoutes.js
// Daily closing: saves the day's report in the database.
// After a closing, the "current day" of the Orders page starts again from 0.
// Weekly / monthly reports are built from the saved daily reports.
//
// Rules:
//  - Only COMPLETED orders count as revenue. Revenue is NOT profit.
//  - A day cannot be closed while orders are still pending or preparing.
//  - Saved reports cannot be edited or deleted from the app.
//
// In server.js, add this line AFTER the "const pool = new Pool(...)" block:
//   app.use("/api", require("./routes/closingsRoutes")(pool));

const express = require("express");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Orders created after the last closing (or all orders if there is no closing yet)
const SINCE_SQL = "(SELECT COALESCE(MAX(closed_at), '-infinity'::timestamp) FROM day_closings)";
const IN_PERIOD = `o.created_at > ${SINCE_SQL} AND o.created_at <= CURRENT_TIMESTAMP`;

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

// Adds several saved daily reports together (money is added in cents)
function buildReport(rows, from, to) {
    let completed = 0;
    let cancelled = 0;
    let revenueCents = 0;

    const days = new Map();
    const products = new Map();
    const categories = new Map();

    for (const row of rows) {
        const cents = Math.round(Number(row.revenue) * 100);
        completed += row.completed_orders;
        cancelled += row.cancelled_orders;
        revenueCents += cents;

        const day = days.get(row.report_date) || {
            report_date: row.report_date,
            orders: 0,
            revenue_cents: 0,
            closings: 0,
        };
        day.orders += row.completed_orders;
        day.revenue_cents += cents;
        day.closings += 1;
        days.set(row.report_date, day);

        const details = row.details || {};

        for (const p of details.products || []) {
            const key = `${p.product_name}||${p.category}`;
            const item = products.get(key) || {
                product_name: p.product_name,
                category: p.category,
                quantity: 0,
                revenue_cents: 0,
            };
            item.quantity += Number(p.quantity) || 0;
            item.revenue_cents += Math.round(Number(p.revenue) * 100) || 0;
            products.set(key, item);
        }

        for (const c of details.categories || []) {
            const item = categories.get(c.category) || {
                category: c.category,
                quantity: 0,
                revenue_cents: 0,
            };
            item.quantity += Number(c.quantity) || 0;
            item.revenue_cents += Math.round(Number(c.revenue) * 100) || 0;
            categories.set(c.category, item);
        }
    }

    return {
        from,
        to,
        closings_count: rows.length,
        totals: {
            completed_orders: completed,
            cancelled_orders: cancelled,
            revenue: revenueCents / 100,
            average_order: completed > 0 ? revenueCents / 100 / completed : 0,
        },
        days: [...days.values()]
            .sort((a, b) => a.report_date.localeCompare(b.report_date))
            .map((d) => ({
                report_date: d.report_date,
                orders: d.orders,
                revenue: d.revenue_cents / 100,
                closings: d.closings,
            })),
        products: [...products.values()]
            .sort((a, b) => b.quantity - a.quantity || b.revenue_cents - a.revenue_cents)
            .slice(0, 20)
            .map((p) => ({ ...p, revenue: p.revenue_cents / 100 })),
        categories: [...categories.values()]
            .sort((a, b) => b.revenue_cents - a.revenue_cents)
            .map((c) => ({ ...c, revenue: c.revenue_cents / 100 })),
    };
}

const CLOSING_COLUMNS = `
    closing_id,
    TO_CHAR(report_date, 'YYYY-MM-DD') AS report_date,
    period_start,
    closed_at,
    completed_orders,
    cancelled_orders,
    revenue::float8 AS revenue
`;

module.exports = function closingsRoutes(pool) {
    const router = express.Router();

    // ---------- WHEN WAS THE LAST CLOSING? ----------
    router.get("/day-closings/current", async (req, res) => {
        try {
            const result = await pool.query("SELECT MAX(closed_at) AS last_closed_at FROM day_closings");
            res.json({ last_closed_at: result.rows[0].last_closed_at });
        } catch (error) {
            console.error("Current closing:", error);
            res.status(500).json({ message: "Failed to load the last closing." });
        }
    });

    // ---------- SAVED DAILY REPORTS (list) ----------
    router.get("/day-closings", async (req, res) => {
        const range = parseRange(req.query);
        if (range.error) return res.status(400).json({ message: range.error });

        try {
            const result = await pool.query(
                `SELECT ${CLOSING_COLUMNS}
                 FROM day_closings
                 WHERE report_date BETWEEN $1::date AND $2::date
                 ORDER BY closed_at DESC
                 LIMIT 500`,
                [range.from, range.to]
            );
            res.json(result.rows);
        } catch (error) {
            console.error("List closings:", error);
            res.status(500).json({ message: "Failed to load the saved reports." });
        }
    });

    // ---------- ONE REPORT FOR A DAY, WEEK, MONTH OR ANY DATES ----------
    router.get("/day-closings/report", async (req, res) => {
        const range = parseRange(req.query);
        if (range.error) return res.status(400).json({ message: range.error });

        try {
            const result = await pool.query(
                `SELECT ${CLOSING_COLUMNS}, details
                 FROM day_closings
                 WHERE report_date BETWEEN $1::date AND $2::date
                 ORDER BY closed_at`,
                [range.from, range.to]
            );
            res.json(buildReport(result.rows, range.from, range.to));
        } catch (error) {
            console.error("Closings report:", error);
            res.status(500).json({ message: "Failed to build the report." });
        }
    });

    // ---------- CLOSE THE DAY ----------
    router.post("/day-closings", async (req, res) => {
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            // One closing at a time, and no order can be created or changed while closing
            await client.query("SELECT pg_advisory_xact_lock(727001)");
            await client.query("LOCK TABLE orders IN SHARE ROW EXCLUSIVE MODE");

            const open = await client.query(
                `SELECT COUNT(*)::int AS open_orders
                 FROM orders o
                 WHERE o.status IN ('pending', 'preparing') AND ${IN_PERIOD}`
            );
            if (open.rows[0].open_orders > 0) {
                await client.query("ROLLBACK");
                return res.status(409).json({
                    message: `${open.rows[0].open_orders} order(s) are still open. Complete or cancel them before closing the day.`,
                });
            }

            const summary = await client.query(
                `SELECT
                    COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed_orders,
                    COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_orders,
                    COALESCE(SUM(o.total) FILTER (WHERE o.status = 'completed'), 0)::float8 AS revenue
                 FROM orders o
                 WHERE ${IN_PERIOD}`
            );
            const totals = summary.rows[0];

            if (totals.completed_orders === 0 && totals.cancelled_orders === 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "There are no orders since the last closing." });
            }

            const products = await client.query(
                `SELECT
                    i.product_name,
                    COALESCE(i.category, 'Other') AS category,
                    SUM(i.quantity)::int AS quantity,
                    SUM(i.line_total)::float8 AS revenue
                 FROM order_items i
                 JOIN orders o ON o.order_id = i.order_id
                 WHERE o.status = 'completed' AND ${IN_PERIOD}
                 GROUP BY i.product_name, COALESCE(i.category, 'Other')
                 ORDER BY quantity DESC, revenue DESC`
            );

            const categories = await client.query(
                `SELECT
                    COALESCE(i.category, 'Other') AS category,
                    SUM(i.quantity)::int AS quantity,
                    SUM(i.line_total)::float8 AS revenue
                 FROM order_items i
                 JOIN orders o ON o.order_id = i.order_id
                 WHERE o.status = 'completed' AND ${IN_PERIOD}
                 GROUP BY COALESCE(i.category, 'Other')
                 ORDER BY revenue DESC`
            );

            const saved = await client.query(
                `INSERT INTO day_closings
                    (period_start, completed_orders, cancelled_orders, revenue, details)
                 VALUES (
                    (SELECT MAX(closed_at) FROM day_closings),
                    $1, $2, $3, $4::jsonb
                 )
                 RETURNING ${CLOSING_COLUMNS}, details`,
                [
                    totals.completed_orders,
                    totals.cancelled_orders,
                    totals.revenue,
                    JSON.stringify({ products: products.rows, categories: categories.rows }),
                ]
            );

            await client.query("COMMIT");

            const closing = saved.rows[0];
            res.status(201).json({
                closing: {
                    closing_id: closing.closing_id,
                    report_date: closing.report_date,
                    closed_at: closing.closed_at,
                },
                report: buildReport([closing], closing.report_date, closing.report_date),
            });
        } catch (error) {
            await client.query("ROLLBACK");
            console.error("Close day:", error);
            res.status(500).json({ message: "Failed to close the day." });
        } finally {
            client.release();
        }
    });

    return router;
};