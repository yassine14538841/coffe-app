// frontend/src/utils/printReport.js
// Shared by the Orders page and the Reports page.
// Change the currency here, once, for the whole app.

export const CURRENCY = "TND";

export function money(value) {
    return `${Number(value).toFixed(2)} ${CURRENCY}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Opens a print window with the report.
// Returns false if the browser blocked the window.
export function printReport(report, title) {
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) return false;

    const totals = report.totals;
    const period =
        report.from === report.to ? report.from : `${report.from} to ${report.to}`;

    const dayRows = report.days
        .map(
            (day) => `
            <tr>
                <td>${escapeHtml(day.report_date)}</td>
                <td class="num">${day.orders}</td>
                <td class="num">${escapeHtml(money(day.revenue))}</td>
            </tr>`
        )
        .join("");

    const productRows = report.products
        .map(
            (item) => `
            <tr>
                <td>${escapeHtml(item.product_name)}</td>
                <td>${escapeHtml(item.category)}</td>
                <td class="num">${item.quantity}</td>
                <td class="num">${escapeHtml(money(item.revenue))}</td>
            </tr>`
        )
        .join("");

    const categoryRows = report.categories
        .map(
            (item) => `
            <tr>
                <td>${escapeHtml(item.category)}</td>
                <td class="num">${item.quantity}</td>
                <td class="num">${escapeHtml(money(item.revenue))}</td>
            </tr>`
        )
        .join("");

    win.document.write(`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)} ${escapeHtml(period)}</title>
    <style>
        body { font-family: Arial, sans-serif; color: #222; max-width: 720px; margin: 24px auto; padding: 0 16px; }
        h1 { margin: 0 0 4px; font-size: 22px; }
        h2 { margin: 26px 0 8px; font-size: 16px; }
        .period { margin: 0 0 18px; color: #555; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; border-bottom: 2px solid #222; padding: 6px 4px; }
        td { border-bottom: 1px solid #ddd; padding: 6px 4px; }
        .num { text-align: right; white-space: nowrap; }
        .summary td:first-child { color: #555; }
        .summary td:last-child { text-align: right; font-weight: bold; }
        .note { margin-top: 24px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <h1>Coffee Shop - ${escapeHtml(title)}</h1>
    <p class="period">Period: ${escapeHtml(period)}</p>

    <table class="summary">
        <tbody>
            <tr><td>Revenue (completed orders)</td><td>${escapeHtml(money(totals.revenue))}</td></tr>
            <tr><td>Completed orders</td><td>${totals.completed_orders}</td></tr>
            <tr><td>Average order</td><td>${escapeHtml(money(totals.average_order))}</td></tr>
            <tr><td>Cancelled orders</td><td>${totals.cancelled_orders}</td></tr>
            <tr><td>Saved daily closings</td><td>${report.closings_count}</td></tr>
        </tbody>
    </table>

    <h2>Sales by day</h2>
    <table>
        <thead><tr><th>Day</th><th class="num">Orders</th><th class="num">Revenue</th></tr></thead>
        <tbody>${dayRows || '<tr><td colspan="3">No data</td></tr>'}</tbody>
    </table>

    <h2>Best-selling products</h2>
    <table>
        <thead><tr><th>Product</th><th>Category</th><th class="num">Sold</th><th class="num">Revenue</th></tr></thead>
        <tbody>${productRows || '<tr><td colspan="4">No data</td></tr>'}</tbody>
    </table>

    <h2>Sales by category</h2>
    <table>
        <thead><tr><th>Category</th><th class="num">Items</th><th class="num">Revenue</th></tr></thead>
        <tbody>${categoryRows || '<tr><td colspan="3">No data</td></tr>'}</tbody>
    </table>

    <p class="note">Revenue counts completed orders only. Revenue is not profit.</p>
</body>
</html>`);

    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);

    return true;
}