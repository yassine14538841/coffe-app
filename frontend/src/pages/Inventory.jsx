import { useCallback, useEffect, useState } from "react";

const API = "http://localhost:5000/api";

const UNITS = ["g", "kg", "ml", "l", "pcs"];

const EMPTY_FORM = { name: "", unit: "g", current_stock: "", min_stock: "" };
const EMPTY_STOCK = { type: "addition", value: "", reason: "" };

const STATUS_LABELS = { ok: "OK", low: "Low", out: "Out of stock" };

const TYPE_LABELS = {
    initial: "Starting stock",
    addition: "Stock added",
    adjustment: "Adjustment",
    delivery: "Delivery",
    order_use: "Used by order",
};

// 2.5 -> "2.5", 3 -> "3"
function fmt(value) {
    return String(Number(Number(value).toFixed(3)));
}

function Inventory() {
    const [ingredients, setIngredients] = useState([]);
    const [history, setHistory] = useState([]);
    const [historyFilter, setHistoryFilter] = useState("");

    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);

    const [stockTarget, setStockTarget] = useState(null);
    const [stockForm, setStockForm] = useState(EMPTY_STOCK);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
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
            const historyPath = historyFilter
                ? `/stock-movements?ingredient_id=${historyFilter}&limit=50`
                : "/stock-movements?limit=50";

            const [ingredientData, historyData] = await Promise.all([
                request("/ingredients"),
                request(historyPath),
            ]);

            setIngredients(Array.isArray(ingredientData) ? ingredientData : []);
            setHistory(Array.isArray(historyData) ? historyData : []);
        } catch (err) {
            setError(
                `Could not load the inventory. Check that the backend is running and the inventory tables exist. ${err.message}`
            );
        } finally {
            setLoading(false);
        }
    }, [request, historyFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const lowCount = ingredients.filter((i) => i.stock_status === "low").length;
    const outCount = ingredients.filter((i) => i.stock_status === "out").length;

    /* ---------- ingredient form: add / edit ---------- */

    function handleFormChange(event) {
        setForm((current) => ({
            ...current,
            [event.target.name]: event.target.value,
        }));
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        setMessage("");

        if (!form.name.trim()) {
            setError("Please enter the ingredient name.");
            return;
        }

        const minimum = form.min_stock === "" ? 0 : Number(form.min_stock);
        const startStock = form.current_stock === "" ? 0 : Number(form.current_stock);

        if (!Number.isFinite(minimum) || minimum < 0) {
            setError("Minimum stock must be 0 or more.");
            return;
        }
        if (editingId === null && (!Number.isFinite(startStock) || startStock < 0)) {
            setError("Starting stock must be 0 or more.");
            return;
        }

        setSaving(true);

        try {
            if (editingId === null) {
                await request("/ingredients", {
                    method: "POST",
                    body: JSON.stringify({
                        name: form.name.trim(),
                        unit: form.unit,
                        current_stock: startStock,
                        min_stock: minimum,
                    }),
                });
                setMessage("Ingredient added successfully.");
            } else {
                await request(`/ingredients/${editingId}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        name: form.name.trim(),
                        unit: form.unit,
                        min_stock: minimum,
                    }),
                });
                setMessage("Ingredient updated successfully.");
            }

            setForm(EMPTY_FORM);
            setEditingId(null);
            await loadData();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    function startEdit(ingredient) {
        setEditingId(ingredient.ingredient_id);
        setForm({
            name: ingredient.name,
            unit: ingredient.unit,
            current_stock: "",
            min_stock: String(ingredient.min_stock),
        });
        setStockTarget(null);
        setError("");
        setMessage("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function cancelEdit() {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setError("");
    }

    async function deleteIngredient(ingredient) {
        if (
            !window.confirm(
                `Delete ${ingredient.name}? Its stock history will be deleted too.`
            )
        ) {
            return;
        }

        setError("");
        setMessage("");

        try {
            await request(`/ingredients/${ingredient.ingredient_id}`, {
                method: "DELETE",
            });
            setMessage("Ingredient deleted successfully.");

            if (editingId === ingredient.ingredient_id) cancelEdit();
            if (stockTarget?.ingredient_id === ingredient.ingredient_id) {
                setStockTarget(null);
            }
            if (String(historyFilter) === String(ingredient.ingredient_id)) {
                setHistoryFilter("");
            }

            await loadData();
        } catch (err) {
            setError(err.message);
        }
    }

    /* ---------- stock change (needs the admin's approval) ---------- */

    function openStock(ingredient) {
        setStockTarget(ingredient);
        setStockForm(EMPTY_STOCK);
        cancelEdit();
        setMessage("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function handleStockChange(event) {
        setStockForm((current) => ({
            ...current,
            [event.target.name]: event.target.value,
        }));
    }

    // The stock that will result from the values typed in the panel
    function previewStock() {
        if (!stockTarget || stockForm.value === "") return null;

        const value = Number(stockForm.value);
        if (!Number.isFinite(value)) return null;

        return stockForm.type === "addition"
            ? stockTarget.current_stock + value
            : value;
    }

    async function submitStock(event) {
        event.preventDefault();
        setError("");
        setMessage("");

        const value = Number(stockForm.value);
        const reason = stockForm.reason.trim();

        if (stockForm.value === "" || !Number.isFinite(value)) {
            setError("Please enter a quantity.");
            return;
        }
        if (stockForm.type === "addition" && value <= 0) {
            setError("The quantity to add must be greater than 0.");
            return;
        }
        if (stockForm.type === "adjustment" && value < 0) {
            setError("The counted stock must be 0 or more.");
            return;
        }
        if (stockForm.type === "adjustment" && !reason) {
            setError("Please write a reason for the adjustment.");
            return;
        }

        const newStock = previewStock();
        const unit = stockTarget.unit;

        const approved = window.confirm(
            `Change the stock of ${stockTarget.name} from ${fmt(stockTarget.current_stock)} ${unit} to ${fmt(newStock)} ${unit}?`
        );
        if (!approved) return;

        setSaving(true);

        try {
            await request(`/ingredients/${stockTarget.ingredient_id}/movements`, {
                method: "POST",
                body: JSON.stringify(
                    stockForm.type === "addition"
                        ? { type: "addition", quantity: value, reason }
                        : { type: "adjustment", new_stock: value, reason }
                ),
            });

            setMessage(`Stock of ${stockTarget.name} updated to ${fmt(newStock)} ${unit}.`);
            setStockTarget(null);
            setStockForm(EMPTY_STOCK);
            await loadData();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    const preview = previewStock();

    return (
        <div className="inv-page">
            <header className="inv-header">
                <h1 className="inv-title">Inventory</h1>
                <p className="inv-note">
                    Manage ingredients and stock. Every stock change is confirmed by you and saved in the history.
                </p>
            </header>

            {error && <p className="inv-error" role="alert">{error}</p>}
            {message && <p className="inv-success" role="status">{message}</p>}

            {/* ============ SUMMARY ============ */}
            <div className="inv-summary">
                <div className="inv-summary-card">
                    <span>Ingredients</span>
                    <strong>{ingredients.length}</strong>
                </div>
                <div className="inv-summary-card inv-summary-card--low">
                    <span>Low stock</span>
                    <strong>{lowCount}</strong>
                </div>
                <div className="inv-summary-card inv-summary-card--out">
                    <span>Out of stock</span>
                    <strong>{outCount}</strong>
                </div>
            </div>

            {/* ============ INGREDIENT LIST ============ */}
            <section className="inv-section">
                <h2 className="inv-section-title">
                    {editingId === null ? "Add an ingredient" : "Edit ingredient"}
                </h2>

                <form className="inv-form" onSubmit={handleSubmit}>
                    <input
                        className="inv-field inv-field--wide"
                        name="name"
                        placeholder="Ingredient name (for example Milk)"
                        value={form.name}
                        onChange={handleFormChange}
                        maxLength={100}
                    />

                    <select
                        className="inv-field"
                        name="unit"
                        value={form.unit}
                        onChange={handleFormChange}
                        aria-label="Unit"
                    >
                        {UNITS.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                        ))}
                    </select>

                    {editingId === null && (
                        <input
                            className="inv-field"
                            type="number"
                            min="0"
                            step="any"
                            name="current_stock"
                            placeholder="Starting stock"
                            value={form.current_stock}
                            onChange={handleFormChange}
                        />
                    )}

                    <input
                        className="inv-field"
                        type="number"
                        min="0"
                        step="any"
                        name="min_stock"
                        placeholder="Minimum stock"
                        value={form.min_stock}
                        onChange={handleFormChange}
                    />

                    <button className="inv-btn inv-btn--primary" type="submit" disabled={saving}>
                        {saving
                            ? "Saving..."
                            : editingId === null
                                ? "Add ingredient"
                                : "Save changes"}
                    </button>

                    {editingId !== null && (
                        <button className="inv-btn" type="button" onClick={cancelEdit}>
                            Cancel
                        </button>
                    )}
                </form>

                {editingId !== null && (
                    <p className="inv-hint">
                        To change the stock quantity, use the "Change stock" button in the list.
                    </p>
                )}
            </section>

            {/* ---------- stock change panel ---------- */}
            {stockTarget && (
                <form className="inv-stock-panel" onSubmit={submitStock}>
                    <h2 className="inv-section-title">
                        Change stock: {stockTarget.name}
                    </h2>
                    <p className="inv-stock-current">
                        Current stock: <strong>{fmt(stockTarget.current_stock)} {stockTarget.unit}</strong>
                        {" "}(minimum {fmt(stockTarget.min_stock)} {stockTarget.unit})
                    </p>

                    <div className="inv-radio-row">
                        <label className="inv-radio">
                            <input
                                type="radio"
                                name="type"
                                value="addition"
                                checked={stockForm.type === "addition"}
                                onChange={handleStockChange}
                            />
                            Add stock
                        </label>
                        <label className="inv-radio">
                            <input
                                type="radio"
                                name="type"
                                value="adjustment"
                                checked={stockForm.type === "adjustment"}
                                onChange={handleStockChange}
                            />
                            Set the counted quantity
                        </label>
                    </div>

                    <div className="inv-form">
                        <input
                            className="inv-field"
                            type="number"
                            min="0"
                            step="any"
                            name="value"
                            placeholder={
                                stockForm.type === "addition"
                                    ? `Quantity to add (${stockTarget.unit})`
                                    : `New stock (${stockTarget.unit})`
                            }
                            value={stockForm.value}
                            onChange={handleStockChange}
                        />
                        <input
                            className="inv-field inv-field--wide"
                            name="reason"
                            placeholder={
                                stockForm.type === "adjustment"
                                    ? "Reason (required): counted by hand, spoiled..."
                                    : "Reason (optional): delivery, purchase..."
                            }
                            value={stockForm.reason}
                            onChange={handleStockChange}
                            maxLength={200}
                        />
                    </div>

                    {preview !== null && (
                        <p className="inv-preview">
                            New stock will be <strong>{fmt(preview)} {stockTarget.unit}</strong>
                        </p>
                    )}

                    <div className="inv-form">
                        <button className="inv-btn inv-btn--primary" type="submit" disabled={saving}>
                            {saving ? "Saving..." : "Approve and save"}
                        </button>
                        <button
                            className="inv-btn"
                            type="button"
                            onClick={() => setStockTarget(null)}
                            disabled={saving}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            <section className="inv-section">
                <h2 className="inv-section-title">Ingredient list</h2>

                <div className="inv-scroll">
                    <table className="inv-table">
                        <thead>
                            <tr>
                                <th>Ingredient</th>
                                <th>Stock</th>
                                <th>Minimum</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="inv-empty">Loading inventory...</td>
                                </tr>
                            ) : ingredients.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="inv-empty">
                                        No ingredients yet. Add the first one above.
                                    </td>
                                </tr>
                            ) : (
                                ingredients.map((ingredient) => (
                                    <tr key={ingredient.ingredient_id}>
                                        <td className="inv-name">{ingredient.name}</td>
                                        <td>{fmt(ingredient.current_stock)} {ingredient.unit}</td>
                                        <td>{fmt(ingredient.min_stock)} {ingredient.unit}</td>
                                        <td>
                                            <span className={`inv-status inv-status--${ingredient.stock_status}`}>
                                                {STATUS_LABELS[ingredient.stock_status]}
                                            </span>
                                        </td>
                                        <td className="inv-actions">
                                            <button
                                                className="inv-btn inv-btn--small inv-btn--primary"
                                                type="button"
                                                onClick={() => openStock(ingredient)}
                                            >
                                                Change stock
                                            </button>
                                            <button
                                                className="inv-btn inv-btn--small"
                                                type="button"
                                                onClick={() => startEdit(ingredient)}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="inv-btn inv-btn--small inv-btn--danger"
                                                type="button"
                                                onClick={() => deleteIngredient(ingredient)}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ============ STOCK HISTORY ============ */}
            <section className="inv-section">
                <div className="inv-section-head">
                    <h2 className="inv-section-title">Stock history</h2>

                    <select
                        className="inv-field inv-filter"
                        value={historyFilter}
                        onChange={(event) => setHistoryFilter(event.target.value)}
                        aria-label="Filter history by ingredient"
                    >
                        <option value="">All ingredients</option>
                        {ingredients.map((ingredient) => (
                            <option key={ingredient.ingredient_id} value={ingredient.ingredient_id}>
                                {ingredient.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="inv-scroll">
                    <table className="inv-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Ingredient</th>
                                <th>Type</th>
                                <th>Change</th>
                                <th>Stock after</th>
                                <th>Reason</th>
                            </tr>
                        </thead>

                        <tbody>
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="inv-empty">No stock movements yet.</td>
                                </tr>
                            ) : (
                                history.map((move) => (
                                    <tr key={move.movement_id}>
                                        <td className="inv-date">
                                            {new Date(move.created_at).toLocaleString()}
                                        </td>
                                        <td className="inv-name">{move.ingredient_name}</td>
                                        <td>{TYPE_LABELS[move.movement_type] || move.movement_type}</td>
                                        <td className={move.quantity_change >= 0 ? "inv-plus" : "inv-minus"}>
                                            {move.quantity_change >= 0 ? "+" : ""}
                                            {fmt(move.quantity_change)} {move.unit}
                                        </td>
                                        <td>{fmt(move.stock_after)} {move.unit}</td>
                                        <td className="inv-reason">{move.reason || "-"}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );

}

export default Inventory;
