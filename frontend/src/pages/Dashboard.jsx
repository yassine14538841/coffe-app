import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CURRENCY, money } from "../utils/printReport";

const API = "http://localhost:5000/api";

const REFRESH_MS = 60000;

const STATUS_LABELS = {
    pending: "Pending",
    preparing: "Preparing",
    completed: "Completed",
    cancelled: "Cancelled",
};

const STOCK_LABELS = { low: "Low", out: "Out of stock" };

async function get(path) {
    const response = await fetch(`${API}${path}`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || `Request failed (${response.status})`);
    }

    return data;
}

function pad(number) {
    return String(number).padStart(2, "0");
}

function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Days without sales are shown as 0
function fillDays(series, from, to) {
    const byDay = new Map(series.map((row) => [row.period, row]));
    const days = [];
    const cursor = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);

    while (cursor <= end) {
        const key = dateKey(cursor);
        days.push(byDay.get(key) || { period: key, orders: 0, revenue: 0 });
        cursor.setDate(cursor.getDate() + 1);
    }

    return days;
}

function Dashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [updatedAt, setUpdatedAt] = useState(null);

    useEffect(() => {
        let ignore = false;

        async function load() {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const to = dateKey(today);
            const start = new Date(today);
            start.setDate(start.getDate() - 6);
            const from = dateKey(start);

            try {
                const [currentOrders, latestOrders, week, products, ingredients, shifts] =
                    await Promise.all([
                        get("/orders?scope=current&limit=500"),
                        get("/orders?limit=8"),
                        get(`/reports/sales?from=${from}&to=${to}&group=day`),
                        get(`/reports/products?from=${from}&to=${to}`),
                        get("/ingredients"),
                        get(`/shifts?date=${to}`),
                    ]);

                if (ignore) return;

                setData({
                    currentOrders,
                    latestOrders,
                    week: fillDays(week.series, from, to),
                    products: products.slice(0, 5),
                    ingredients,
                    shifts,
                    today: to,
                });
                setUpdatedAt(new Date());
                setError("");
            } catch (err) {
                if (!ignore) {
                    setError(
                        `Could not load the dashboard. Check that the backend is running. ${err.message}`
                    );
                }
            } finally {
                if (!ignore) setLoading(false);
            }
        }

        load();
        const timer = setInterval(load, REFRESH_MS);

        return () => {
            ignore = true;
            clearInterval(timer);
        };
    }, []);

    const todayText = new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    // ---------- numbers calculated from the real records ----------
    let revenue = 0;
    let completedCount = 0;
    let openCount = 0;
    let cancelledCount = 0;
    let orderCount = 0;
    let lowItems = [];
    let outCount = 0;
    let working = [];
    let weekTotal = 0;
    let maxRevenue = 0;
    let maxSold = 0;

    if (data) {
        let revenueCents = 0;

        for (const order of data.currentOrders) {
            if (order.status === "completed") {
                completedCount += 1;
                revenueCents += Math.round(order.total * 100);
            } else if (order.status === "cancelled") {
                cancelledCount += 1;
            } else {
                openCount += 1;
            }
        }

        revenue = revenueCents / 100;
        orderCount = completedCount + openCount;

        lowItems = data.ingredients
            .filter((item) => item.stock_status !== "ok")
            .sort((a, b) => (a.stock_status === "out" ? -1 : 1) - (b.stock_status === "out" ? -1 : 1));
        outCount = lowItems.filter((item) => item.stock_status === "out").length;

        working = data.shifts.filter((shift) => shift.status !== "cancelled");

        weekTotal = data.week.reduce((sum, day) => sum + day.revenue, 0);
        maxRevenue = Math.max(0, ...data.week.map((day) => day.revenue));
        maxSold = Math.max(0, ...data.products.map((item) => item.quantity));
    }

    return (
        <div className="dashboard">
            {/* ============ HEADER ============ */}
            <header className="dashboard-header">
                <div>
                    <p className="dashboard-eyebrow">OVERVIEW</p>
                    <h1>Dashboard</h1>
                    <p className="dashboard-subtitle">
                        Live data from your orders, stock, and staff schedule.
                    </p>
                </div>

                <div className="dashboard-date">
                    <span className="date-icon">📅</span>
                    <div>
                        <strong>Today</strong>
                        <span>{todayText}</span>
                    </div>
                </div>
            </header>

            {error && <p className="dash-error" role="alert">{error}</p>}
            {loading && !data && <p className="dash-empty">Loading dashboard...</p>}

            {data && (
                <>
                    {/* ============ STATISTICS ============ */}
                    <div className="stats-grid">
                        <div className="stat-card sales-card">
                            <div className="stat-card-top">
                                <span className="stat-label">Sales (current day)</span>
                                <span className="stat-icon">💰</span>
                            </div>
                            <h2>
                                {revenue.toFixed(2)} <span>{CURRENCY}</span>
                            </h2>
                            <p className="stat-description">
                                <span className="stat-highlight">{completedCount}</span> completed orders
                            </p>
                        </div>

                        <div className="stat-card">
                            <div className="stat-card-top">
                                <span className="stat-label">Orders (current day)</span>
                                <span className="stat-icon">🧾</span>
                            </div>
                            <h2>{orderCount}</h2>
                            <p className="stat-description">
                                {openCount} open, {cancelledCount} cancelled
                            </p>
                        </div>

                        <div className="stat-card stock-card">
                            <div className="stat-card-top">
                                <span className="stat-label">Low-stock ingredients</span>
                                <span className="stat-icon">⚠</span>
                            </div>
                            <h2>{lowItems.length}</h2>
                            <p className={outCount > 0 ? "stat-description stock-warning" : "stat-description"}>
                                {outCount > 0 ? `${outCount} out of stock` : "Nothing is out of stock"}
                            </p>
                        </div>

                        <div className="stat-card">
                            <div className="stat-card-top">
                                <span className="stat-label">Staff working today</span>
                                <span className="stat-icon">👥</span>
                            </div>
                            <h2>{working.length}</h2>
                            <p className="stat-description">Scheduled shifts today</p>
                        </div>
                    </div>

                    <p className="dash-note">
                        "Current day" starts after the last daily closing on the Orders page.
                        Expenses and profit are not shown yet, because expenses are not recorded.
                        {updatedAt && ` Updated at ${updatedAt.toLocaleTimeString()}, refreshed every minute.`}
                    </p>

                    {/* ============ SALES + PRODUCTS ============ */}
                    <div className="dashboard-content-grid">
                        <section className="dashboard-panel">
                            <div className="panel-header">
                                <div>
                                    <h2>Sales, last 7 days</h2>
                                    <p>Completed orders only</p>
                                </div>
                                <span className="panel-badge">{money(weekTotal)}</span>
                            </div>

                            <div className="sales-chart">
                                {data.week.map((day) => (
                                    <div
                                        key={day.period}
                                        className="chart-column"
                                        title={`${day.period}: ${money(day.revenue)} (${day.orders} orders)`}
                                    >
                                        <span className="chart-value">{day.revenue.toFixed(0)}</span>
                                        <div className="chart-bar-track">
                                            <div
                                                className={
                                                    day.period === data.today
                                                        ? "chart-bar chart-bar-highlight"
                                                        : "chart-bar"
                                                }
                                                style={{
                                                    height: `${maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0}%`,
                                                }}
                                            />
                                        </div>
                                        <span className="chart-day">
                                            {new Date(`${day.period}T00:00:00`).toLocaleDateString(undefined, {
                                                weekday: "short",
                                            })}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <p className="chart-note">
                                <span className="chart-note-dot" />
                                Revenue per day in {CURRENCY}. Today is the dark bar.
                            </p>
                        </section>

                        <section className="dashboard-panel">
                            <div className="panel-header">
                                <div>
                                    <h2>Popular products</h2>
                                    <p>Last 7 days</p>
                                </div>
                                <Link className="dash-link" to="/reports">Reports</Link>
                            </div>

                            {data.products.length === 0 ? (
                                <p className="dash-empty">No completed sales in the last 7 days.</p>
                            ) : (
                                <div className="popular-list">
                                    {data.products.map((item, index) => (
                                        <div key={`${item.product_name}-${item.category}`}>
                                            <div className="popular-item-info">
                                                <span className="popular-rank">{index + 1}</span>
                                                <span className="popular-name">{item.product_name}</span>
                                                <strong>{item.quantity} sold</strong>
                                            </div>
                                            <div className="popular-progress-track">
                                                <div
                                                    className="popular-progress"
                                                    style={{
                                                        width: `${maxSold > 0 ? (item.quantity / maxSold) * 100 : 0}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* ============ LOW STOCK + STAFF ============ */}
                    <div className="dashboard-content-grid">
                        <section className="dashboard-panel">
                            <div className="panel-header">
                                <div>
                                    <h2>Low-stock alerts</h2>
                                    <p>Ingredients at or under their minimum</p>
                                </div>
                                <Link className="dash-link" to="/inventory">Inventory</Link>
                            </div>

                            {lowItems.length === 0 ? (
                                <p className="dash-empty">All ingredients are above their minimum.</p>
                            ) : (
                                <ul className="dash-list">
                                    {lowItems.slice(0, 6).map((item) => (
                                        <li key={item.ingredient_id} className="dash-list-item">
                                            <div className="dash-list-main">
                                                <strong>{item.name}</strong>
                                                <span>
                                                    {Number(item.current_stock.toFixed(3))} {item.unit} left, minimum{" "}
                                                    {Number(item.min_stock.toFixed(3))} {item.unit}
                                                </span>
                                            </div>
                                            <span className={`dash-chip dash-chip--${item.stock_status}`}>
                                                {STOCK_LABELS[item.stock_status]}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="dashboard-panel">
                            <div className="panel-header">
                                <div>
                                    <h2>Working today</h2>
                                    <p>From the weekly schedule</p>
                                </div>
                                <Link className="dash-link" to="/employees">Employees</Link>
                            </div>

                            {working.length === 0 ? (
                                <p className="dash-empty">No shift is scheduled today.</p>
                            ) : (
                                <ul className="dash-list">
                                    {working.map((shift) => (
                                        <li key={shift.shift_id} className="dash-list-item">
                                            <div className="dash-list-main">
                                                <strong>{`${shift.first_name || ""} ${shift.last_name || ""}`.trim()}</strong>
                                                <span>{shift.job_title || shift.role || "Employee"}</span>
                                            </div>
                                            <span className="dash-chip dash-chip--time">
                                                {String(shift.start_time).slice(0, 5)} - {String(shift.end_time).slice(0, 5)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>

                    {/* ============ RECENT ORDERS ============ */}
                    <section className="dashboard-panel orders-section">
                        <div className="panel-header">
                            <div>
                                <h2>Recent orders</h2>
                                <p>The latest orders, any status</p>
                            </div>
                            <div className="dash-header-actions">
                                <span className="orders-count">Latest {data.latestOrders.length}</span>
                                <Link className="dash-link" to="/orders">All orders</Link>
                            </div>
                        </div>

                        <div className="orders-table-wrapper">
                            <table className="orders-table">
                                <thead>
                                    <tr>
                                        <th>Order</th>
                                        <th>Date</th>
                                        <th>Items</th>
                                        <th>Status</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.latestOrders.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="dash-empty">No orders yet.</td>
                                        </tr>
                                    ) : (
                                        data.latestOrders.map((order) => (
                                            <tr key={order.order_id}>
                                                <td className="order-id">#{order.order_id}</td>
                                                <td className="order-time">
                                                    {new Date(order.created_at).toLocaleString()}
                                                </td>
                                                <td className="order-product">{order.item_count}</td>
                                                <td>
                                                    <span className={`order-status status-${order.status}`}>
                                                        <span className="status-dot" />
                                                        {STATUS_LABELS[order.status]}
                                                    </span>
                                                </td>
                                                <td className="order-total">{money(order.total)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>

    );
}

export default Dashboard;
