import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    Ban,
    Banknote,
    Check,
    ChefHat,
    ClipboardList,
    Clock,
    Eye,
    Lock,
    Minus,
    Plus,
    Printer,
    Search,
    ShoppingBag,
    X,
} from "lucide-react";
import { money, printReport } from "../utils/printReport";

const API = "http://localhost:5000/api";

const STATUS_LABELS = {
    pending: "Pending",
    preparing: "Preparing",
    completed: "Completed",
    cancelled: "Cancelled",
};

// Same rules as the backend: completed and cancelled are final
const TRANSITIONS = {
    pending: ["preparing", "completed", "cancelled"],
    preparing: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
};

const ACTION_LABELS = {
    preparing: "Start preparing",
    completed: "Mark as completed",
    cancelled: "Cancel order",
};

const FILTERS = ["all", "pending", "preparing", "completed", "cancelled"];

// The coloured tiles at the top: icon + colour for each status
const TILES = [
    { status: "pending", label: "Pending", icon: Clock },
    { status: "preparing", label: "Preparing", icon: ChefHat },
    { status: "completed", label: "Completed", icon: Check },
    { status: "cancelled", label: "Cancelled", icon: Ban },
];

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// The page that is opened for printing (works without any other CSS)
function buildReceiptHtml(order) {
    const rows = order.items
        .map(
            (item) => `
            <tr>
                <td>${escapeHtml(item.product_name)}<br><small>${escapeHtml(item.category)}</small></td>
                <td class="num">${item.quantity}</td>
                <td class="num">${escapeHtml(money(item.unit_price))}</td>
                <td class="num">${escapeHtml(money(item.line_total))}</td>
            </tr>`
        )
        .join("");

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order #${order.order_id}</title>
    <style>
        body { font-family: Arial, sans-serif; color: #222; max-width: 380px; margin: 20px auto; padding: 0 12px; }
        h1 { margin: 0 0 4px; font-size: 20px; text-align: center; }
        .meta { margin: 0 0 14px; text-align: center; font-size: 13px; color: #555; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; border-bottom: 2px solid #222; padding: 6px 4px; }
        td { border-bottom: 1px solid #ddd; padding: 6px 4px; vertical-align: top; }
        small { color: #666; }
        .num { text-align: right; white-space: nowrap; }
        .total { display: flex; justify-content: space-between; margin-top: 12px; font-size: 16px; font-weight: bold; }
        .note { margin-top: 12px; font-size: 13px; }
        .thanks { margin-top: 18px; text-align: center; font-size: 12px; color: #555; }
    </style>
</head>
<body>
    <h1>Coffee Shop</h1>
    <p class="meta">
        Order #${order.order_id}<br>
        ${escapeHtml(new Date(order.created_at).toLocaleString())}<br>
        Status: ${escapeHtml(STATUS_LABELS[order.status])}
    </p>
    <table>
        <thead>
            <tr><th>Product</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>
    <div class="total"><span>Total</span><span>${escapeHtml(money(order.total))}</span></div>
    ${order.note ? `<p class="note"><strong>Note:</strong> ${escapeHtml(order.note)}</p>` : ""}
    <p class="thanks">Thank you!</p>
</body>
</html>`;
}

// Side panel that slides in from the right
function Drawer({ title, subtitle, onClose, children, footer }) {
    return (
        <div className="ord-drawer-overlay" onClick={onClose}>
            <aside
                className="ord-drawer"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(event) => event.stopPropagation()}
            >
                <header className="ord-drawer-head">
                    <div>
                        <h2>{title}</h2>
                        {subtitle}
                    </div>

                    <button
                        type="button"
                        className="ord-icon-btn"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </header>

                <div className="ord-drawer-body">{children}</div>

                {footer && <footer className="ord-drawer-foot">{footer}</footer>}
            </aside>
        </div>
    );
}

function Orders() {
    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);

    // filters
    const [statusFilter, setStatusFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [query, setQuery] = useState("");
    const [scope, setScope] = useState("current");
    const [lastClosedAt, setLastClosedAt] = useState(null);

    // side panel: null, "new" or "details"
    const [drawer, setDrawer] = useState(null);

    // new order
    const [cart, setCart] = useState([]);
    const [note, setNote] = useState("");
    const [search, setSearch] = useState("");
    const [pickerCategory, setPickerCategory] = useState("all");
    const [creating, setCreating] = useState(false);

    // order details
    const [selected, setSelected] = useState(null);
    const [updating, setUpdating] = useState(false);

    const [closing, setClosing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const request = useCallback(async (path, options = {}) => {
        const response = await fetch(`${API}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || `Request failed (${response.status})`);
        }

        return data;
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);

        try {
            const [productData, orderData, closingData] = await Promise.all([
                request("/products"),
                request(`/orders?limit=200&scope=${scope}`),
                request("/day-closings/current"),
            ]);

            setProducts(Array.isArray(productData) ? productData : []);
            setOrders(Array.isArray(orderData) ? orderData : []);
            setLastClosedAt(closingData.last_closed_at || null);
        } catch (err) {
            setError(
                `Could not load orders. Check that the backend is running and the orders and day_closings tables exist. ${err.message}`
            );
        } finally {
            setLoading(false);
        }
    }, [request, scope]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Escape closes the side panel
    useEffect(() => {
        if (!drawer) return undefined;

        function onKey(event) {
            if (event.key === "Escape") setDrawer(null);
        }

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [drawer]);

    /* ---------- products and cart ---------- */

    // Only products that are available can be ordered
    const availableProducts = products.filter((p) => p.is_available !== false);

    const productCategories = [
        ...new Set(availableProducts.map((p) => p.category || "Other")),
    ].sort((a, b) => a.localeCompare(b));

    const visibleProducts = availableProducts.filter((p) => {
        if (pickerCategory !== "all" && (p.category || "Other") !== pickerCategory) {
            return false;
        }

        const text = search.trim().toLowerCase();
        if (!text) return true;

        return (
            String(p.name || "").toLowerCase().includes(text) ||
            String(p.category || "").toLowerCase().includes(text)
        );
    });

    const productById = new Map(products.map((p) => [p.id, p]));
    const inCart = new Map(cart.map((line) => [line.product_id, line.quantity]));

    const cartLines = cart
        .map((line) => {
            const product = productById.get(line.product_id);
            return product ? { ...line, product } : null;
        })
        .filter(Boolean);

    const cartTotalCents = cartLines.reduce(
        (sum, line) => sum + Math.round(Number(line.product.price) * 100) * line.quantity,
        0
    );
    const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);

    function addToCart(product) {
        setCart((current) => {
            const existing = current.find((l) => l.product_id === product.id);

            if (existing) {
                return current.map((l) =>
                    l.product_id === product.id
                        ? { ...l, quantity: Math.min(l.quantity + 1, 100) }
                        : l
                );
            }

            return [...current, { product_id: product.id, quantity: 1 }];
        });
    }

    function changeQuantity(productId, delta) {
        setCart((current) =>
            current
                .map((l) =>
                    l.product_id === productId
                        ? { ...l, quantity: Math.min(l.quantity + delta, 100) }
                        : l
                )
                .filter((l) => l.quantity > 0)
        );
    }

    function clearCart() {
        setCart([]);
        setNote("");
    }

    function openNewOrder() {
        setError("");
        setMessage("");
        setDrawer("new");
    }

    async function createOrder() {
        setError("");
        setMessage("");

        if (cartLines.length === 0) {
            setError("Add at least one product to the order.");
            return;
        }

        setCreating(true);

        try {
            const order = await request("/orders", {
                method: "POST",
                body: JSON.stringify({
                    items: cartLines.map((l) => ({
                        product_id: l.product_id,
                        quantity: l.quantity,
                    })),
                    note: note.trim(),
                }),
            });

            // The total shown here is the one calculated by the server
            setMessage(`Order #${order.order_id} created. Total: ${money(order.total)}.`);
            clearCart();
            setDrawer(null);
            await loadData();
        } catch (err) {
            setError(err.message);
        } finally {
            setCreating(false);
        }
    }

    /* ---------- order list ---------- */

    const counts = { pending: 0, preparing: 0, completed: 0, cancelled: 0 };
    let revenueCents = 0;

    for (const order of orders) {
        counts[order.status] += 1;
        if (order.status === "completed") {
            revenueCents += Math.round(order.total * 100);
        }
    }

    const orderCategories = [
        ...new Set(orders.flatMap((o) => o.categories || [])),
    ].sort((a, b) => a.localeCompare(b));

    const visibleOrders = orders.filter((order) => {
        if (statusFilter !== "all" && order.status !== statusFilter) return false;

        if (
            categoryFilter !== "all" &&
            !(order.categories || []).includes(categoryFilter)
        ) {
            return false;
        }

        const text = query.trim().toLowerCase().replace("#", "");
        if (!text) return true;

        return (
            String(order.order_id).includes(text) ||
            (order.categories || []).join(" ").toLowerCase().includes(text) ||
            String(order.note || "").toLowerCase().includes(text)
        );
    });

    function toggleStatus(status) {
        setStatusFilter((current) => (current === status ? "all" : status));
    }

    /* ---------- details, status, printing ---------- */

    async function openOrder(id) {
        setError("");
        setMessage("");

        try {
            setSelected(await request(`/orders/${id}`));
            setDrawer("details");
        } catch (err) {
            setError(err.message);
        }
    }

    function printOrder(order) {
        const win = window.open("", "_blank", "width=480,height=700");

        if (!win) {
            setError("Your browser blocked the print window. Allow pop-ups for this site and try again.");
            return;
        }

        win.document.write(buildReceiptHtml(order));
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    async function printById(id) {
        setError("");

        try {
            printOrder(await request(`/orders/${id}`));
        } catch (err) {
            setError(err.message);
        }
    }

    async function changeStatus(order, status) {
        const confirmText =
            status === "cancelled"
                ? `Cancel order #${order.order_id}? This cannot be undone.`
                : status === "completed"
                    ? `Mark order #${order.order_id} as completed? This cannot be undone.`
                    : null;

        if (confirmText && !window.confirm(confirmText)) return;

        setError("");
        setMessage("");
        setUpdating(true);

        try {
            const updated = await request(`/orders/${order.order_id}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
            });

            setSelected(updated);
            setMessage(`Order #${updated.order_id} is now ${STATUS_LABELS[updated.status].toLowerCase()}.`);
            await loadData();
        } catch (err) {
            setError(err.message);
        } finally {
            setUpdating(false);
        }
    }

    /* ---------- close the day ---------- */

    async function closeDay() {
        const approved = window.confirm(
            "Close the day?\n\nThe daily report is saved and printed, and the current day returns to 0. All orders stay in the history."
        );
        if (!approved) return;

        setError("");
        setMessage("");
        setClosing(true);

        try {
            const result = await request("/day-closings", {
                method: "POST",
                body: JSON.stringify({}),
            });

            setMessage(
                `Day closed. Revenue: ${money(result.report.totals.revenue)}. The report was saved.`
            );

            if (!printReport(result.report, "Daily report")) {
                setError(
                    "The report was saved, but your browser blocked the print window. You can print it from Reports, in Saved reports."
                );
            }

            await loadData();
        } catch (err) {
            setError(err.message);
        } finally {
            setClosing(false);
        }
    }

    const hasFilters = statusFilter !== "all" || categoryFilter !== "all" || query.trim() !== "";

    return (
        <div className="ord-page">
            {/* ============ HEADER ============ */}
            <header className="ord-header">
                <div>
                    <h1 className="ord-title">Orders</h1>
                    <p className="ord-note">
                        {scope === "current" ? "Current day" : "All orders"}
                        {" - "}
                        {lastClosedAt
                            ? `since the last closing, ${new Date(lastClosedAt).toLocaleString()}`
                            : "no day has been closed yet"}
                    </p>
                </div>

                <div className="ord-header-actions">
                    <button
                        type="button"
                        className="ord-btn"
                        onClick={closeDay}
                        disabled={closing}
                    >
                        <Lock size={16} />
                        {closing ? "Closing..." : "Close day"}
                    </button>

                    <button
                        type="button"
                        className="ord-btn ord-btn--primary"
                        onClick={openNewOrder}
                    >
                        <Plus size={16} />
                        New order
                    </button>
                </div>
            </header>

            {error && <p className="ord-error" role="alert">{error}</p>}
            {message && <p className="ord-success" role="status">{message}</p>}

            {/* ============ COLOURED TILES (click to filter) ============ */}
            <div className="ord-tiles">
                <div className="ord-tile ord-tile--revenue">
                    <span className="ord-tile-icon"><Banknote size={22} /></span>
                    <div>
                        <span className="ord-tile-label">Revenue</span>
                        <strong className="ord-tile-value">{money(revenueCents / 100)}</strong>
                    </div>
                </div>

                {TILES.map(({ status, label, icon: Icon }) => (
                    <button
                        key={status}
                        type="button"
                        className={
                            statusFilter === status
                                ? `ord-tile ord-tile--${status} ord-tile--active`
                                : `ord-tile ord-tile--${status}`
                        }
                        onClick={() => toggleStatus(status)}
                        aria-pressed={statusFilter === status}
                    >
                        <span className="ord-tile-icon"><Icon size={22} /></span>
                        <div>
                            <span className="ord-tile-label">{label}</span>
                            <strong className="ord-tile-value">{counts[status]}</strong>
                        </div>
                    </button>
                ))}
            </div>

            {/* ============ ORDER LIST ============ */}
            <section className="ord-card">
                <div className="ord-toolbar">
                    <div className="ord-tabs">
                        {FILTERS.map((filter) => (
                            <button
                                key={filter}
                                type="button"
                                className={statusFilter === filter ? "ord-tab ord-tab--active" : "ord-tab"}
                                onClick={() => setStatusFilter(filter)}
                            >
                                {filter === "all" ? "All" : STATUS_LABELS[filter]}
                            </button>
                        ))}
                    </div>

                    <div className="ord-toolbar-right">
                        <label className="ord-search">
                            <Search size={16} />
                            <input
                                className="ord-field"
                                placeholder="Search order, category, note"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </label>

                        <select
                            className="ord-field ord-filter-select"
                            value={categoryFilter}
                            onChange={(event) => setCategoryFilter(event.target.value)}
                            aria-label="Filter orders by category"
                        >
                            <option value="all">All categories</option>
                            {orderCategories.map((category) => (
                                <option key={category} value={category}>{category}</option>
                            ))}
                        </select>

                        <div className="ord-segment" role="group" aria-label="Orders to show">
                            <button
                                type="button"
                                className={scope === "current" ? "ord-segment-btn ord-segment-btn--active" : "ord-segment-btn"}
                                onClick={() => setScope("current")}
                            >
                                Current day
                            </button>
                            <button
                                type="button"
                                className={scope === "all" ? "ord-segment-btn ord-segment-btn--active" : "ord-segment-btn"}
                                onClick={() => setScope("all")}
                            >
                                All
                            </button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <p className="ord-empty">Loading orders...</p>
                ) : visibleOrders.length === 0 ? (
                    <div className="ord-empty-state">
                        <span className="ord-empty-icon"><ClipboardList size={30} /></span>
                        <h3>{orders.length === 0 ? "No orders yet" : "No orders match"}</h3>
                        <p>
                            {orders.length === 0
                                ? "Create the first order of the day to see it here."
                                : "Try another status, category, or search."}
                        </p>
                        {orders.length === 0 ? (
                            <button type="button" className="ord-btn ord-btn--primary" onClick={openNewOrder}>
                                <Plus size={16} />
                                New order
                            </button>
                        ) : (
                            hasFilters && (
                                <button
                                    type="button"
                                    className="ord-btn"
                                    onClick={() => {
                                        setStatusFilter("all");
                                        setCategoryFilter("all");
                                        setQuery("");
                                    }}
                                >
                                    Clear filters
                                </button>
                            )
                        )}
                    </div>
                ) : (
                    <div className="ord-scroll">
                        <table className="ord-table">
                            <thead>
                                <tr>
                                    <th>Order</th>
                                    <th>Date</th>
                                    <th>Items</th>
                                    <th>Categories</th>
                                    <th>Status</th>
                                    <th className="ord-right">Total</th>
                                    <th className="ord-right">Actions</th>
                                </tr>
                            </thead>

                            <tbody>
                                {visibleOrders.map((order) => (
                                    <tr key={order.order_id}>
                                        <td>
                                            <button
                                                type="button"
                                                className="ord-link"
                                                onClick={() => openOrder(order.order_id)}
                                            >
                                                #{order.order_id}
                                            </button>
                                        </td>
                                        <td className="ord-date">
                                            {new Date(order.created_at).toLocaleString()}
                                        </td>
                                        <td>{order.item_count}</td>
                                        <td>
                                            <div className="ord-cats">
                                                {(order.categories || []).map((category) => (
                                                    <span key={category} className="ord-cat">{category}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`ord-status ord-status--${order.status}`}>
                                                {STATUS_LABELS[order.status]}
                                            </span>
                                        </td>
                                        <td className="ord-money ord-right">{money(order.total)}</td>
                                        <td>
                                            <div className="ord-row-actions">
                                                <button
                                                    type="button"
                                                    className="ord-icon-btn"
                                                    title="View details"
                                                    aria-label={`View order ${order.order_id}`}
                                                    onClick={() => openOrder(order.order_id)}
                                                >
                                                    <Eye size={17} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="ord-icon-btn"
                                                    title="Print"
                                                    aria-label={`Print order ${order.order_id}`}
                                                    onClick={() => printById(order.order_id)}
                                                >
                                                    <Printer size={17} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* ============ SIDE PANEL: NEW ORDER ============ */}
            {drawer === "new" && (
                <Drawer
                    title="New order"
                    subtitle={<p className="ord-drawer-sub">Pick products from your Products page.</p>}
                    onClose={() => setDrawer(null)}
                    footer={
                        <>
                            {cartLines.length > 0 && (
                                <ul className="ord-cart-list">
                                    {cartLines.map((line) => (
                                        <li key={line.product_id} className="ord-cart-line">
                                            <div className="ord-cart-info">
                                                <strong>{line.product.name}</strong>
                                                <small>{money(line.product.price)} each</small>
                                            </div>

                                            <div className="ord-qty">
                                                <button
                                                    type="button"
                                                    aria-label={`Remove one ${line.product.name}`}
                                                    onClick={() => changeQuantity(line.product_id, -1)}
                                                >
                                                    <Minus size={14} />
                                                </button>
                                                <span>{line.quantity}</span>
                                                <button
                                                    type="button"
                                                    aria-label={`Add one ${line.product.name}`}
                                                    onClick={() => changeQuantity(line.product_id, 1)}
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <input
                                className="ord-field"
                                placeholder="Note (optional)"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                maxLength={300}
                            />

                            <div className="ord-total">
                                <span>
                                    Total {cartCount > 0 && `(${cartCount} items)`}
                                </span>
                                <strong>{money(cartTotalCents / 100)}</strong>
                            </div>

                            <div className="ord-foot-actions">
                                <button
                                    type="button"
                                    className="ord-btn ord-btn--primary ord-btn--wide"
                                    onClick={createOrder}
                                    disabled={creating || cartLines.length === 0}
                                >
                                    <ShoppingBag size={16} />
                                    {creating ? "Creating..." : "Create order"}
                                </button>
                                <button
                                    type="button"
                                    className="ord-btn"
                                    onClick={clearCart}
                                    disabled={creating || cartLines.length === 0}
                                >
                                    Clear
                                </button>
                            </div>
                        </>
                    }
                >
                    <label className="ord-search ord-search--block">
                        <Search size={16} />
                        <input
                            className="ord-field"
                            placeholder="Search a product"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </label>

                    {productCategories.length > 0 && (
                        <div className="ord-chips">
                            {["all", ...productCategories].map((category) => (
                                <button
                                    key={category}
                                    type="button"
                                    className={pickerCategory === category ? "ord-chip ord-chip--active" : "ord-chip"}
                                    onClick={() => setPickerCategory(category)}
                                >
                                    {category === "all" ? "All" : category}
                                </button>
                            ))}
                        </div>
                    )}

                    {availableProducts.length === 0 ? (
                        <div className="ord-empty-state ord-empty-state--small">
                            <span className="ord-empty-icon"><ShoppingBag size={26} /></span>
                            <h3>No products yet</h3>
                            <p>Add your products first, then come back to take orders.</p>
                            <Link className="ord-btn" to="/products">Go to Products</Link>
                        </div>
                    ) : visibleProducts.length === 0 ? (
                        <p className="ord-empty">No product matches your search.</p>
                    ) : (
                        <div className="ord-product-grid">
                            {visibleProducts.map((product) => (
                                <button
                                    key={product.id}
                                    type="button"
                                    className="ord-product"
                                    onClick={() => addToCart(product)}
                                >
                                    <span className="ord-product-name">{product.name}</span>
                                    <span className="ord-product-cat">{product.category || "Other"}</span>
                                    <span className="ord-product-price">{money(product.price)}</span>
                                    {inCart.get(product.id) > 0 && (
                                        <span className="ord-product-count">{inCart.get(product.id)}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </Drawer>
            )}

            {/* ============ SIDE PANEL: ORDER DETAILS ============ */}
            {drawer === "details" && selected && (
                <Drawer
                    title={`Order #${selected.order_id}`}
                    subtitle={
                        <p className="ord-drawer-sub">
                            <span className={`ord-status ord-status--${selected.status}`}>
                                {STATUS_LABELS[selected.status]}
                            </span>
                            {" "}
                            {new Date(selected.created_at).toLocaleString()}
                        </p>
                    }
                    onClose={() => setDrawer(null)}
                    footer={
                        <>
                            <div className="ord-total">
                                <span>Total</span>
                                <strong>{money(selected.total)}</strong>
                            </div>

                            <div className="ord-foot-actions">
                                <button type="button" className="ord-btn" onClick={() => printOrder(selected)}>
                                    <Printer size={16} />
                                    Print
                                </button>

                                {TRANSITIONS[selected.status].map((status) => (
                                    <button
                                        key={status}
                                        type="button"
                                        className={
                                            status === "cancelled"
                                                ? "ord-btn ord-btn--danger"
                                                : "ord-btn ord-btn--primary"
                                        }
                                        onClick={() => changeStatus(selected, status)}
                                        disabled={updating}
                                    >
                                        {ACTION_LABELS[status]}
                                    </button>
                                ))}
                            </div>
                        </>
                    }
                >
                    <ul className="ord-lines">
                        {selected.items.map((item) => (
                            <li key={item.order_item_id} className="ord-line">
                                <span className="ord-line-qty">{item.quantity}x</span>
                                <div className="ord-line-info">
                                    <strong>{item.product_name}</strong>
                                    <small>{item.category} - {money(item.unit_price)} each</small>
                                </div>
                                <span className="ord-money">{money(item.line_total)}</span>
                            </li>
                        ))}
                    </ul>

                    {selected.note && (
                        <p className="ord-detail-note">
                            <strong>Note:</strong> {selected.note}
                        </p>
                    )}
                </Drawer>
            )}
        </div>
    );

}

export default Orders;
