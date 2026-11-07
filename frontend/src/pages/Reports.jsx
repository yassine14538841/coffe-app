import { useEffect, useState } from "react";
import { money, printReport } from "../utils/printReport";

const API = "http://localhost:5000/api";

const GROUPS = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
];

const PRESETS = [
    { id: "today", label: "Today" },
    { id: "7d", label: "Last 7 days" },
    { id: "30d", label: "Last 30 days" },
    { id: "month", label: "This month" },
];

const STATUS_LABELS = { ok: "OK", low: "Low", out: "Out of stock" };

function pad(number) {
    return String(number).padStart(2, "0");
}

function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function presetRange(id) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    if (id === "7d") start.setDate(start.getDate() - 6);
    if (id === "30d") start.setDate(start.getDate() - 29);
    if (id === "month") start.setDate(1);

    return { from: dateKey(start), to: dateKey(today) };
}

function num(value) {
    return String(Number(Number(value).toFixed(3)));
}

// With the "Day" grouping, days without sales are shown as 0
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

function periodLabel(group, period) {
    if (group === "month") return period.slice(0, 7);
    if (group === "week") return `Week of ${period.slice(5)}`;
    return period.slice(5);
}

function LiveAnalysis() {
    const [preset, setPreset] = useState("30d");
    const [range, setRange] = useState(() => presetRange("30d"));
    const [group, setGroup] = useState("day");

    const [sales, setSales] = useState(null);
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [staff, setStaff] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const rangeError =
        !range.from || !range.to
            ? "Please choose both dates."
            : range.to < range.from
                ? "The end date cannot be before the start date."
                : "";

    useEffect(() => {
        if (rangeError) return undefined;

        let ignore = false;
        const query = `from=${range.from}&to=${range.to}`;

        async function get(path) {
            const response = await fetch(`${API}${path}`);
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.message || `Request failed (${response.status})`);
            }
            return data;
        }

        async function load() {
            setLoading(true);
            setError("");

            try {
                const [salesData, productData, categoryData, inventoryData, staffData] =
                    await Promise.all([
                        get(`/reports/sales?${query}&group=${group}`),
                        get(`/reports/products?${query}`),
                        get(`/reports/categories?${query}`),
                        get(`/reports/inventory?${query}`),
                        get(`/reports/staff?${query}`),
                    ]);

                if (ignore) return;

                setSales(salesData);
                setProducts(productData);
                setCategories(categoryData);
                setInventory(inventoryData);
                setStaff(staffData);
            } catch (err) {
                if (!ignore) {
                    setError(
                        `Could not load the reports. Check that the backend is running. ${err.message}`
                    );
                }
            } finally {
                if (!ignore) setLoading(false);
            }
        }

        load();

        return () => {
            ignore = true;
        };
    }, [range.from, range.to, group, rangeError]);

    function choosePreset(id) {
        setPreset(id);
        setRange(presetRange(id));
    }

    function changeDate(event) {
        setPreset("custom");
        setRange((current) => ({ ...current, [event.target.name]: event.target.value }));
    }

    const summary = sales?.summary;

    const series = sales
        ? group === "day"
            ? fillDays(sales.series, range.from, range.to)
            : sales.series
        : [];

    const maxRevenue = Math.max(0, ...series.map((row) => row.revenue));
    const maxQuantity = Math.max(0, ...products.map((row) => row.quantity));
    const totalCategoryRevenue = categories.reduce((sum, row) => sum + row.revenue, 0);

    return (
        <div className="rep-live">
            <header className="rep-header">
                <div>
                    <h2 className="rep-live-title">Live analysis</h2>
                    <p className="rep-note">
                        Calculated live from all your orders and records. Only completed orders count as sales.
                    </p>
                </div>

                <button
                    type="button"
                    className="rep-btn rep-no-print"
                    onClick={() => window.print()}
                >
                    Print report
                </button>
            </header>

            {/* ============ FILTERS ============ */}
            <section className="rep-filters rep-no-print">
                <div className="rep-presets">
                    {PRESETS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={preset === item.id ? "rep-chip rep-chip--active" : "rep-chip"}
                            onClick={() => choosePreset(item.id)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                <div className="rep-dates">
                    <label>
                        From
                        <input type="date" name="from" value={range.from} onChange={changeDate} />
                    </label>
                    <label>
                        To
                        <input type="date" name="to" value={range.to} onChange={changeDate} />
                    </label>
                    <label>
                        Group sales by
                        <select value={group} onChange={(event) => setGroup(event.target.value)}>
                            {GROUPS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </section>

            <p className="rep-period">
                Period: <strong>{range.from}</strong> to <strong>{range.to}</strong>
            </p>

            {(error || rangeError) && (
                <p className="rep-error" role="alert">{rangeError || error}</p>
            )}

            {loading && !rangeError && <p className="rep-loading">Loading reports...</p>}

            {summary && !rangeError && (
                <>
                    {/* ============ SALES SUMMARY ============ */}
                    <div className="rep-summary">
                        <div className="rep-card rep-card--main">
                            <span>Revenue</span>
                            <strong>{money(summary.revenue)}</strong>
                            <small>Completed orders only</small>
                        </div>
                        <div className="rep-card">
                            <span>Completed orders</span>
                            <strong>{summary.completed_orders}</strong>
                        </div>
                        <div className="rep-card">
                            <span>Average order</span>
                            <strong>{money(summary.average_order)}</strong>
                        </div>
                        <div className="rep-card">
                            <span>Open orders</span>
                            <strong>{summary.open_orders}</strong>
                            <small>Pending or preparing</small>
                        </div>
                        <div className="rep-card">
                            <span>Cancelled orders</span>
                            <strong>{summary.cancelled_orders}</strong>
                        </div>
                    </div>

                    {/* ============ SALES OVER TIME ============ */}
                    <section className="rep-section">
                        <h2 className="rep-section-title">Sales over time</h2>

                        {series.length === 0 ? (
                            <p className="rep-empty">No completed orders in this period.</p>
                        ) : (
                            <>
                                <div className="rep-chart-scroll">
                                    <div className="rep-chart">
                                        {series.map((row) => (
                                            <div
                                                key={row.period}
                                                className="rep-bar-col"
                                                title={`${row.period}: ${money(row.revenue)} (${row.orders} orders)`}
                                            >
                                                <div className="rep-bar-track">
                                                    <div
                                                        className="rep-bar"
                                                        style={{
                                                            height: `${maxRevenue > 0 ? Math.max((row.revenue / maxRevenue) * 100, row.revenue > 0 ? 3 : 0) : 0}%`,
                                                        }}
                                                    />
                                                </div>
                                                <span className="rep-bar-label">
                                                    {periodLabel(group, row.period)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rep-scroll">
                                    <table className="rep-table">
                                        <thead>
                                            <tr>
                                                <th>{group === "day" ? "Day" : group === "week" ? "Week starting" : "Month"}</th>
                                                <th>Orders</th>
                                                <th>Revenue</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {series
                                                .filter((row) => row.orders > 0)
                                                .map((row) => (
                                                    <tr key={row.period}>
                                                        <td>{group === "month" ? row.period.slice(0, 7) : row.period}</td>
                                                        <td>{row.orders}</td>
                                                        <td className="rep-money">{money(row.revenue)}</td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </section>

                    {/* ============ PRODUCTS + CATEGORIES ============ */}
                    <div className="rep-two">
                        <section className="rep-section">
                            <h2 className="rep-section-title">Best-selling products</h2>

                            {products.length === 0 ? (
                                <p className="rep-empty">No sales in this period.</p>
                            ) : (
                                <ol className="rep-rank">
                                    {products.map((row) => (
                                        <li key={`${row.product_name}-${row.category}`}>
                                            <div className="rep-rank-top">
                                                <strong>{row.product_name}</strong>
                                                <span>{row.quantity} sold</span>
                                            </div>
                                            <div className="rep-progress">
                                                <div
                                                    style={{ width: `${maxQuantity > 0 ? (row.quantity / maxQuantity) * 100 : 0}%` }}
                                                />
                                            </div>
                                            <small>
                                                {row.category} - {money(row.revenue)}
                                            </small>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>

                        <section className="rep-section">
                            <h2 className="rep-section-title">Sales by category</h2>

                            {categories.length === 0 ? (
                                <p className="rep-empty">No sales in this period.</p>
                            ) : (
                                <ul className="rep-rank">
                                    {categories.map((row) => {
                                        const share =
                                            totalCategoryRevenue > 0
                                                ? (row.revenue / totalCategoryRevenue) * 100
                                                : 0;
                                        return (
                                            <li key={row.category}>
                                                <div className="rep-rank-top">
                                                    <strong>{row.category}</strong>
                                                    <span>{share.toFixed(0)}%</span>
                                                </div>
                                                <div className="rep-progress">
                                                    <div style={{ width: `${share}%` }} />
                                                </div>
                                                <small>
                                                    {row.quantity} items - {money(row.revenue)}
                                                </small>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>
                    </div>

                    {/* ============ INVENTORY ============ */}
                    <section className="rep-section">
                        <h2 className="rep-section-title">Inventory movements</h2>

                        {inventory.length === 0 ? (
                            <p className="rep-empty">No ingredients yet.</p>
                        ) : (
                            <div className="rep-scroll">
                                <table className="rep-table">
                                    <thead>
                                        <tr>
                                            <th>Ingredient</th>
                                            <th>Added</th>
                                            <th>Used by orders</th>
                                            <th>Adjustments</th>
                                            <th>Stock now</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inventory.map((row) => (
                                            <tr key={row.ingredient_id}>
                                                <td className="rep-name">{row.name}</td>
                                                <td className="rep-plus">+{num(row.added)} {row.unit}</td>
                                                <td>{num(row.used)} {row.unit}</td>
                                                <td className={row.adjusted < 0 ? "rep-minus" : ""}>
                                                    {row.adjusted > 0 ? "+" : ""}{num(row.adjusted)} {row.unit}
                                                </td>
                                                <td>{num(row.current_stock)} {row.unit}</td>
                                                <td>
                                                    <span className={`rep-status rep-status--${row.stock_status}`}>
                                                        {STATUS_LABELS[row.stock_status]}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <p className="rep-hint">
                            "Used by orders" stays at 0 until orders deduct ingredients from the stock automatically.
                        </p>
                    </section>

                    {/* ============ STAFF ============ */}
                    <section className="rep-section">
                        <h2 className="rep-section-title">Staff hours and absences</h2>

                        {staff.length === 0 ? (
                            <p className="rep-empty">No employees yet.</p>
                        ) : (
                            <div className="rep-scroll">
                                <table className="rep-table">
                                    <thead>
                                        <tr>
                                            <th>Employee</th>
                                            <th>Role</th>
                                            <th>Shifts</th>
                                            <th>Scheduled hours</th>
                                            <th>Approved absence days</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {staff.map((row) => (
                                            <tr key={row.employee_id}>
                                                <td className="rep-name">
                                                    {`${row.first_name || ""} ${row.last_name || ""}`.trim()}
                                                </td>
                                                <td>{row.job_title || "-"}</td>
                                                <td>{row.shifts}</td>
                                                <td>{row.hours.toFixed(1)} h</td>
                                                <td>{row.absence_days}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    {/* ============ FINANCE (LATER) ============ */}
                    <section className="rep-section rep-later">
                        <h2 className="rep-section-title">Expenses and profit</h2>
                        <p>
                            Coming later. Expenses are not recorded yet, so the profit cannot be calculated honestly.
                        </p>
                        <p className="rep-hint">
                            Revenue (above) is not profit. Profit is revenue minus expenses.
                        </p>
                    </section>
                </>
            )}
        </div>
    );
}

const MODES = [
    { id: "day", label: "Day" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
    { id: "custom", label: "Custom dates" },
];

const REPORT_TITLES = {
    day: "Daily report",
    week: "Weekly report",
    month: "Monthly report",
    custom: "Report",
};

async function apiGet(path) {
    const response = await fetch(`${API}${path}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || `Request failed (${response.status})`);
    }
    return data;
}

// Turns the chosen mode into two dates (both days included)
function savedRange(mode, anchor, month, custom) {
    if (mode === "day") return { from: anchor, to: anchor };

    if (mode === "week") {
        if (!anchor) return { from: "", to: "" };
        const date = new Date(`${anchor}T00:00:00`);
        const weekday = date.getDay();
        date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
        const from = dateKey(date);
        date.setDate(date.getDate() + 6);
        return { from, to: dateKey(date) };
    }

    if (mode === "month") {
        if (!/^\d{4}-\d{2}$/.test(month)) return { from: "", to: "" };
        const [year, number] = month.split("-").map(Number);
        return {
            from: `${year}-${pad(number)}-01`,
            to: dateKey(new Date(year, number, 0)),
        };
    }

    return custom;
}

function SavedReports() {
    const today = dateKey(new Date());

    const [mode, setMode] = useState("day");
    const [anchor, setAnchor] = useState(today);
    const [month, setMonth] = useState(today.slice(0, 7));
    const [custom, setCustom] = useState({ from: today, to: today });

    const [report, setReport] = useState(null);
    const [closings, setClosings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const range = savedRange(mode, anchor, month, custom);

    const rangeError =
        !range.from || !range.to
            ? "Please choose the date."
            : range.to < range.from
                ? "The end date cannot be before the start date."
                : "";

    useEffect(() => {
        if (rangeError) return undefined;

        let ignore = false;

        async function load() {
            setLoading(true);
            setError("");

            try {
                const query = `from=${range.from}&to=${range.to}`;
                const [reportData, closingData] = await Promise.all([
                    apiGet(`/day-closings/report?${query}`),
                    apiGet(`/day-closings?${query}`),
                ]);

                if (ignore) return;
                setReport(reportData);
                setClosings(closingData);
            } catch (err) {
                if (!ignore) {
                    setError(
                        `Could not load the saved reports. Check that the backend is running and the day_closings table exists. ${err.message}`
                    );
                }
            } finally {
                if (!ignore) setLoading(false);
            }
        }

        load();

        return () => {
            ignore = true;
        };
    }, [range.from, range.to, rangeError]);

    function blockedMessage() {
        setError("Your browser blocked the print window. Allow pop-ups for this site and try again.");
    }

    function printCurrent() {
        if (report && !printReport(report, REPORT_TITLES[mode])) blockedMessage();
    }

    // Prints one saved day (all its closings together)
    async function printDay(date) {
        setError("");

        try {
            const data = await apiGet(`/day-closings/report?from=${date}&to=${date}`);
            if (!printReport(data, "Daily report")) blockedMessage();
        } catch (err) {
            setError(err.message);
        }
    }

    const totals = report?.totals;

    return (
        <div>
            <section className="rep-filters">
                <div className="rep-presets">
                    {MODES.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={mode === item.id ? "rep-chip rep-chip--active" : "rep-chip"}
                            onClick={() => setMode(item.id)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                <div className="rep-dates">
                    {(mode === "day" || mode === "week") && (
                        <label>
                            {mode === "day" ? "Day" : "Any day of the week"}
                            <input type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} />
                        </label>
                    )}

                    {mode === "month" && (
                        <label>
                            Month
                            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                        </label>
                    )}

                    {mode === "custom" && (
                        <>
                            <label>
                                From
                                <input
                                    type="date"
                                    value={custom.from}
                                    onChange={(event) => setCustom({ ...custom, from: event.target.value })}
                                />
                            </label>
                            <label>
                                To
                                <input
                                    type="date"
                                    value={custom.to}
                                    onChange={(event) => setCustom({ ...custom, to: event.target.value })}
                                />
                            </label>
                        </>
                    )}

                    <button
                        type="button"
                        className="rep-btn rep-btn--primary rep-align-end"
                        onClick={printCurrent}
                        disabled={!report || report.closings_count === 0}
                    >
                        Print {REPORT_TITLES[mode].toLowerCase()}
                    </button>
                </div>
            </section>

            {!rangeError && (
                <p className="rep-period">
                    Period: <strong>{range.from}</strong> to <strong>{range.to}</strong>
                </p>
            )}

            {(error || rangeError) && (
                <p className="rep-error" role="alert">{rangeError || error}</p>
            )}

            {loading && !rangeError && <p className="rep-loading">Loading saved reports...</p>}

            {report && !rangeError && report.closings_count === 0 && !loading && (
                <p className="rep-empty">
                    No saved daily report in this period. Close the day on the Orders page to create one.
                </p>
            )}

            {report && !rangeError && report.closings_count > 0 && (
                <>
                    <div className="rep-summary">
                        <div className="rep-card rep-card--main">
                            <span>Revenue</span>
                            <strong>{money(totals.revenue)}</strong>
                            <small>Completed orders only</small>
                        </div>
                        <div className="rep-card">
                            <span>Completed orders</span>
                            <strong>{totals.completed_orders}</strong>
                        </div>
                        <div className="rep-card">
                            <span>Average order</span>
                            <strong>{money(totals.average_order)}</strong>
                        </div>
                        <div className="rep-card">
                            <span>Cancelled orders</span>
                            <strong>{totals.cancelled_orders}</strong>
                        </div>
                        <div className="rep-card">
                            <span>Saved closings</span>
                            <strong>{report.closings_count}</strong>
                        </div>
                    </div>

                    <section className="rep-section">
                        <h2 className="rep-section-title">Sales by day</h2>
                        <div className="rep-scroll">
                            <table className="rep-table">
                                <thead>
                                    <tr>
                                        <th>Day</th>
                                        <th>Orders</th>
                                        <th>Revenue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.days.map((day) => (
                                        <tr key={day.report_date}>
                                            <td>{day.report_date}</td>
                                            <td>{day.orders}</td>
                                            <td className="rep-money">{money(day.revenue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="rep-two">
                        <section className="rep-section">
                            <h2 className="rep-section-title">Best-selling products</h2>
                            {report.products.length === 0 ? (
                                <p className="rep-empty">No sales in this period.</p>
                            ) : (
                                <div className="rep-scroll">
                                    <table className="rep-table rep-table--narrow">
                                        <thead>
                                            <tr>
                                                <th>Product</th>
                                                <th>Sold</th>
                                                <th>Revenue</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {report.products.map((item) => (
                                                <tr key={`${item.product_name}-${item.category}`}>
                                                    <td>
                                                        <span className="rep-name">{item.product_name}</span>
                                                        <small className="rep-sub">{item.category}</small>
                                                    </td>
                                                    <td>{item.quantity}</td>
                                                    <td className="rep-money">{money(item.revenue)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                        <section className="rep-section">
                            <h2 className="rep-section-title">Sales by category</h2>
                            {report.categories.length === 0 ? (
                                <p className="rep-empty">No sales in this period.</p>
                            ) : (
                                <div className="rep-scroll">
                                    <table className="rep-table rep-table--narrow">
                                        <thead>
                                            <tr>
                                                <th>Category</th>
                                                <th>Items</th>
                                                <th>Revenue</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {report.categories.map((item) => (
                                                <tr key={item.category}>
                                                    <td className="rep-name">{item.category}</td>
                                                    <td>{item.quantity}</td>
                                                    <td className="rep-money">{money(item.revenue)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </div>

                    <section className="rep-section">
                        <h2 className="rep-section-title">Saved daily reports</h2>
                        <div className="rep-scroll">
                            <table className="rep-table">
                                <thead>
                                    <tr>
                                        <th>Day</th>
                                        <th>Closed at</th>
                                        <th>Orders</th>
                                        <th>Cancelled</th>
                                        <th>Revenue</th>
                                        <th>Print</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {closings.map((closing) => (
                                        <tr key={closing.closing_id}>
                                            <td>{closing.report_date}</td>
                                            <td>{new Date(closing.closed_at).toLocaleTimeString()}</td>
                                            <td>{closing.completed_orders}</td>
                                            <td>{closing.cancelled_orders}</td>
                                            <td className="rep-money">{money(closing.revenue)}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="rep-btn rep-btn--small"
                                                    onClick={() => printDay(closing.report_date)}
                                                >
                                                    Print day
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

function Reports() {
    const [tab, setTab] = useState("saved");

    return (
        <div className="rep-page">
            <header className="rep-header rep-no-print">
                <div>
                    <h1 className="rep-title">Reports</h1>
                    <p className="rep-note">
                        Daily reports are saved when you close the day on the Orders page.
                        Weekly and monthly reports are built from them.
                    </p>
                </div>
            </header>

            <div className="rep-tabs rep-no-print">
                <button
                    type="button"
                    className={tab === "saved" ? "rep-chip rep-chip--active" : "rep-chip"}
                    onClick={() => setTab("saved")}
                >
                    Saved reports
                </button>
                <button
                    type="button"
                    className={tab === "live" ? "rep-chip rep-chip--active" : "rep-chip"}
                    onClick={() => setTab("live")}
                >
                    Live analysis
                </button>
            </div>

            {tab === "saved" ? <SavedReports /> : <LiveAnalysis />}
        </div>
    );
}

export default Reports;
