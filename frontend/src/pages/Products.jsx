import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

// ============================================================
// SECTION 1 — API CONFIGURATION AND DEFAULT VALUES
// ============================================================

const API_URL = "http://localhost:5000/api/products";

const CATEGORIES = [
    "Coffee",
    "Tea",
    "Cold Drinks",
    "Pastry",
    "Food",
    "Other",
];

const EMPTY_FORM = {
    name: "",
    description: "",
    price: "",
    category: "Coffee",
};

// A recipe is saved as a JSON array in PostgreSQL.
// Structure:
// Section -> Subsection -> Items
const createEmptySection = () => ({
    id: crypto.randomUUID(),
    emoji: "📁",
    title: "New section",
    subsections: [],
});

const createEmptySubsection = () => ({
    id: crypto.randomUUID(),
    emoji: "📝",
    title: "New subsection",
    items: [],
});

const createEmptyRecipeItem = () => ({
    id: crypto.randomUUID(),
    name: "",
    quantity: "",
    unit: "",
    note: "",
});

// ============================================================
// SECTION 2 — SMALL HELPER FUNCTIONS
// ============================================================

function makeStarterRecipe() {
    return [];
}

function normalizeRecipe(recipe) {
    // Older or empty database values should not crash the editor.
    if (!Array.isArray(recipe)) return [];
    return recipe.map((section) => ({
        id: section.id || crypto.randomUUID(),
        emoji: section.emoji || "📁",
        title: section.title || "Untitled section",
        subsections: Array.isArray(section.subsections)
            ? section.subsections.map((subsection) => ({
                  id: subsection.id || crypto.randomUUID(),
                  emoji: subsection.emoji || "📝",
                  title: subsection.title || "Untitled subsection",
                  items: Array.isArray(subsection.items)
                      ? subsection.items.map((item) => ({
                            id: item.id || crypto.randomUUID(),
                            name: item.name || "",
                            quantity: item.quantity ?? "",
                            unit: item.unit || "",
                            note: item.note || "",
                        }))
                      : [],
              }))
            : [],
    }));
}

// ============================================================
// SECTION 3 — PRODUCTS PAGE AND STATE
// ============================================================

function Products() {
    // Product list and product form.
    const [products, setProducts] = useState([]);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [savingProduct, setSavingProduct] = useState(false);

    // Search and category filter.
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("All");

    // Messages shown to the user.
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Recipe panel state: only one product recipe is open at a time.
    const [openRecipeId, setOpenRecipeId] = useState(null);

    // Recipes are cached by product ID in this object.
    // Example: recipes[12] is the recipe for product with ID 12.
    const [recipes, setRecipes] = useState({});
    const [loadingRecipeId, setLoadingRecipeId] = useState(null);
    const [savingRecipeId, setSavingRecipeId] = useState(null);

    // ============================================================
    // SECTION 4 — LOAD PRODUCTS FROM THE BACKEND
    // ============================================================

    const loadProducts = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch(API_URL);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Could not load products.");
            }

            setProducts(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(
                err.message === "Failed to fetch"
                    ? "Cannot connect to the backend. Make sure Node.js is running on port 5000."
                    : err.message
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    // ============================================================
    // SECTION 5 — SEARCH AND CATEGORY FILTER
    // ============================================================

    const filteredProducts = useMemo(() => {
        const searchText = search.toLowerCase().trim();

        return products.filter((product) => {
            const productName = (product.name || "").toLowerCase();
            const description = (product.description || "").toLowerCase();

            const matchesSearch =
                productName.includes(searchText) ||
                description.includes(searchText);

            const matchesCategory =
                categoryFilter === "All" ||
                product.category === categoryFilter;

            return matchesSearch && matchesCategory;
        });
    }, [products, search, categoryFilter]);

    // ============================================================
    // SECTION 6 — ADD A PRODUCT
    // ============================================================

    function handleProductChange(event) {
        const { name, value } = event.target;
        setFormData((previous) => ({ ...previous, [name]: value }));
        setError("");
        setSuccess("");
    }

    async function handleProductSubmit(event) {
        event.preventDefault();
        setError("");
        setSuccess("");

        const name = formData.name.trim();
        const price = Number(formData.price);

        if (!name) {
            setError("Please enter a product name.");
            return;
        }

        if (
            formData.price.trim() === "" ||
            !Number.isFinite(price) ||
            price < 0
        ) {
            setError("Enter a valid, non-negative price.");
            return;
        }

        setSavingProduct(true);

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    description: formData.description.trim(),
                    price,
                    category: formData.category,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Could not save product.");
            }

            setProducts((previous) => [
                data,
                ...previous.filter((product) => product.id !== data.id),
            ]);
            setFormData(EMPTY_FORM);
            setShowForm(false);
            setSuccess("Product saved successfully.");
        } catch (err) {
            setError(
                err.message === "Failed to fetch"
                    ? "Cannot connect to the backend. Check that Node.js is running."
                    : err.message
            );
        } finally {
            setSavingProduct(false);
        }
    }

    // ============================================================
    // SECTION 7 — ENABLE/DISABLE A PRODUCT
    // ============================================================

    async function toggleAvailability(product) {
        setError("");
        setSuccess("");

        try {
            const response = await fetch(
                `${API_URL}/${product.id}/availability`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        is_available: !product.is_available,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Could not update product.");
            }

            setProducts((previous) =>
                previous.map((item) => (item.id === data.id ? data : item))
            );
            setSuccess("Product availability updated.");
        } catch (err) {
            setError(err.message);
        }
    }

    // ============================================================
    // SECTION 8 — DELETE A PRODUCT
    // ============================================================

    async function handleDelete(product) {
        const confirmed = window.confirm(
            `Delete "${product.name}" permanently?`
        );
        if (!confirmed) return;

        setError("");
        setSuccess("");

        try {
            const response = await fetch(`${API_URL}/${product.id}`, {
                method: "DELETE",
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Could not delete product.");
            }

            setProducts((previous) =>
                previous.filter((item) => item.id !== product.id)
            );
            setRecipes((previous) => {
                const next = { ...previous };
                delete next[product.id];
                return next;
            });

            if (openRecipeId === product.id) setOpenRecipeId(null);
            setSuccess("Product deleted successfully.");
        } catch (err) {
            setError(err.message);
        }
    }

    // ============================================================
    // SECTION 9 — LOAD, OPEN, AND CLOSE A PRODUCT RECIPE
    // ============================================================

    async function loadRecipe(productId) {
        setLoadingRecipeId(productId);
        setError("");

        try {
            const response = await fetch(`${API_URL}/${productId}/recipe`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Could not load recipe.");
            }

            setRecipes((previous) => ({
                ...previous,
                [productId]: normalizeRecipe(
                    data.recipe_structure ?? makeStarterRecipe()
                ),
            }));
        } catch (err) {
            setError(
                err.message === "Failed to fetch"
                    ? "Cannot connect to the backend while loading the recipe."
                    : err.message
            );
        } finally {
            setLoadingRecipeId(null);
        }
    }

    async function toggleRecipe(productId) {
        // Clicking the open recipe button closes its panel.
        if (openRecipeId === productId) {
            setOpenRecipeId(null);
            return;
        }

        // Open the selected product's panel.
        setOpenRecipeId(productId);
        setError("");
        setSuccess("");

        // Load from PostgreSQL only the first time this recipe is opened.
        if (recipes[productId] === undefined) {
            await loadRecipe(productId);
        }
    }

    // ============================================================
    // SECTION 10 — UPDATE RECIPE DATA IN REACT STATE
    // ============================================================

    function updateRecipe(productId, updateFunction) {
        setRecipes((previous) => {
            const current = previous[productId] || [];
            return {
                ...previous,
                [productId]: updateFunction(current),
            };
        });
        setSuccess("");
    }

    function addSection(productId) {
        updateRecipe(productId, (sections) => [
            ...sections,
            createEmptySection(),
        ]);
    }

    function updateSection(productId, sectionId, changes) {
        updateRecipe(productId, (sections) =>
            sections.map((section) =>
                section.id === sectionId ? { ...section, ...changes } : section
            )
        );
    }

    function removeSection(productId, sectionId) {
        updateRecipe(productId, (sections) =>
            sections.filter((section) => section.id !== sectionId)
        );
    }

    function addSubsection(productId, sectionId) {
        updateRecipe(productId, (sections) =>
            sections.map((section) =>
                section.id === sectionId
                    ? {
                          ...section,
                          subsections: [
                              ...section.subsections,
                              createEmptySubsection(),
                          ],
                      }
                    : section
            )
        );
    }

    function updateSubsection(productId, sectionId, subsectionId, changes) {
        updateRecipe(productId, (sections) =>
            sections.map((section) =>
                section.id !== sectionId
                    ? section
                    : {
                          ...section,
                          subsections: section.subsections.map((subsection) =>
                              subsection.id === subsectionId
                                  ? { ...subsection, ...changes }
                                  : subsection
                          ),
                      }
            )
        );
    }

    function removeSubsection(productId, sectionId, subsectionId) {
        updateRecipe(productId, (sections) =>
            sections.map((section) =>
                section.id !== sectionId
                    ? section
                    : {
                          ...section,
                          subsections: section.subsections.filter(
                              (subsection) => subsection.id !== subsectionId
                          ),
                      }
            )
        );
    }

    function addRecipeItem(productId, sectionId, subsectionId) {
        updateRecipe(productId, (sections) =>
            sections.map((section) =>
                section.id !== sectionId
                    ? section
                    : {
                          ...section,
                          subsections: section.subsections.map((subsection) =>
                              subsection.id !== subsectionId
                                  ? subsection
                                  : {
                                        ...subsection,
                                        items: [
                                            ...subsection.items,
                                            createEmptyRecipeItem(),
                                        ],
                                    }
                          ),
                      }
            )
        );
    }

    function updateRecipeItem(
        productId,
        sectionId,
        subsectionId,
        itemId,
        changes
    ) {
        updateRecipe(productId, (sections) =>
            sections.map((section) =>
                section.id !== sectionId
                    ? section
                    : {
                          ...section,
                          subsections: section.subsections.map((subsection) =>
                              subsection.id !== subsectionId
                                  ? subsection
                                  : {
                                        ...subsection,
                                        items: subsection.items.map((item) =>
                                            item.id === itemId
                                                ? { ...item, ...changes }
                                                : item
                                        ),
                                    }
                          ),
                      }
            )
        );
    }

    function removeRecipeItem(productId, sectionId, subsectionId, itemId) {
        updateRecipe(productId, (sections) =>
            sections.map((section) =>
                section.id !== sectionId
                    ? section
                    : {
                          ...section,
                          subsections: section.subsections.map((subsection) =>
                              subsection.id !== subsectionId
                                  ? subsection
                                  : {
                                        ...subsection,
                                        items: subsection.items.filter(
                                            (item) => item.id !== itemId
                                        ),
                                    }
                          ),
                      }
            )
        );
    }

    // ============================================================
    // SECTION 11 — SAVE RECIPE TO POSTGRESQL THROUGH THE BACKEND
    // ============================================================

    async function saveRecipe(productId) {
        setSavingRecipeId(productId);
        setError("");
        setSuccess("");

        try {
            const recipeStructure = normalizeRecipe(recipes[productId] || []);
            const response = await fetch(`${API_URL}/${productId}/recipe`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipe_structure: recipeStructure }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Could not save recipe.");
            }

            // Keep the normalized structure returned by the backend if present.
            setRecipes((previous) => ({
                ...previous,
                [productId]: normalizeRecipe(
                    data.recipe_structure ?? recipeStructure
                ),
            }));
            setSuccess("Recipe saved to the database successfully.");
        } catch (err) {
            setError(
                err.message === "Failed to fetch"
                    ? "Cannot connect to the backend while saving the recipe."
                    : err.message
            );
        } finally {
            setSavingRecipeId(null);
        }
    }

    // ============================================================
    // SECTION 12 — PAGE DISPLAY: HEADER, MESSAGES, AND PRODUCT FORM
    // ============================================================

    return (
        <main className="products-page">
            {/* PAGE HEADER */}
            <header className="products-header">
                <div>
                    <p className="products-eyebrow">CAFE MANAGEMENT</p>
                    <h1>Products</h1>
                    <p>Manage your menu, prices, availability, and recipes.</p>
                </div>

                <button
                    type="button"
                    className="add-product-button"
                    onClick={() => {
                        setShowForm((previous) => !previous);
                        setError("");
                        setSuccess("");
                    }}
                >
                    {showForm ? "Cancel" : "+ Add Product"}
                </button>
            </header>

            {/* GLOBAL ERROR AND SUCCESS MESSAGES */}
            {error && (
                <p className="product-form-error" role="alert">
                    {error}
                </p>
            )}
            {success && (
                <p className="product-success-message" role="status">
                    {success}
                </p>
            )}

            {/* ADD PRODUCT FORM */}
            {showForm && (
                <section className="product-form-card">
                    <h2>Add a new product</h2>
                    <p>Enter the information for your new menu item.</p>

                    <form onSubmit={handleProductSubmit}>
                        <div className="product-form-grid">
                            <label>
                                Product name *
                                <input
                                    name="name"
                                    value={formData.name}
                                    onChange={handleProductChange}
                                    placeholder="e.g. Cappuccino"
                                    maxLength={100}
                                    required
                                />
                            </label>

                            <label>
                                Price (DT) *
                                <input
                                    name="price"
                                    type="number"
                                    value={formData.price}
                                    onChange={handleProductChange}
                                    placeholder="e.g. 5.000"
                                    min="0"
                                    step="0.001"
                                    required
                                />
                            </label>

                            <label>
                                Category *
                                <select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleProductChange}
                                    required
                                >
                                    {CATEGORIES.map((category) => (
                                        <option key={category} value={category}>
                                            {category}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label>
                                Description
                                <input
                                    name="description"
                                    value={formData.description}
                                    onChange={handleProductChange}
                                    placeholder="Short product description"
                                    maxLength={500}
                                />
                            </label>
                        </div>

                        <div className="product-form-actions">
                            <button
                                type="button"
                                className="cancel-product-button"
                                onClick={() => setShowForm(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="add-product-button"
                                disabled={savingProduct}
                            >
                                {savingProduct ? "Saving..." : "Save Product"}
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {/* ====================================================
                SECTION 13 — PRODUCT TABLE AND RECIPE PANEL
               ==================================================== */}
            <section className="products-table-card">
                <div className="products-table-header">
                    <div>
                        <h2>All Products</h2>
                        <p>
                            {products.length}{" "}
                            {products.length === 1 ? "product" : "products"} in
                            your database
                        </p>
                    </div>
                </div>

                {/* SEARCH AND CATEGORY FILTER */}
                <div className="products-toolbar">
                    <input
                        type="search"
                        className="products-search"
                        placeholder="Search products..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />

                    <select
                        className="products-category-filter"
                        value={categoryFilter}
                        onChange={(event) =>
                            setCategoryFilter(event.target.value)
                        }
                        aria-label="Filter by category"
                    >
                        <option value="All">All categories</option>
                        {CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                                {category}
                            </option>
                        ))}
                    </select>
                </div>

                {/* PRODUCT ROWS */}
                <div className="products-table-wrapper">
                    <table className="products-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Category</th>
                                <th>Price</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="empty-products">
                                        Loading products...
                                    </td>
                                </tr>
                            ) : filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="empty-products">
                                        <span className="empty-products-icon">
                                            ☕
                                        </span>
                                        <strong>
                                            {products.length === 0
                                                ? "No products yet"
                                                : "No matching products"}
                                        </strong>
                                        <span>
                                            {products.length === 0
                                                ? 'Click "Add Product" to create your first menu item.'
                                                : "Try another search or category."}
                                        </span>
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((product) => (
                                    <Fragment key={`product-group-${product.id}`}>
                                        {/* MAIN ROW: product information and actions */}
                                        <tr key={`product-${product.id}`}>
                                            <td>
                                                <div className="product-name-cell">
                                                    <span className="product-icon">
                                                        ☕
                                                    </span>
                                                    <div>
                                                        <strong>
                                                            {product.name}
                                                        </strong>
                                                        {product.description && (
                                                            <small>
                                                                {product.description}
                                                            </small>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            <td>{product.category}</td>

                                            <td className="product-price">
                                                {Number(product.price).toFixed(
                                                    3
                                                )}{" "}
                                                DT
                                            </td>

                                            <td>
                                                <span
                                                    className={
                                                        product.is_available
                                                            ? "product-available"
                                                            : "product-unavailable"
                                                    }
                                                >
                                                    {product.is_available
                                                        ? "Available"
                                                        : "Unavailable"}
                                                </span>
                                            </td>

                                            <td>
                                                <div className="product-row-actions">
                                                    {/* RECIPE BUTTON */}
                                                    <button
                                                        type="button"
                                                        className="recipe-manage-button"
                                                        aria-expanded={
                                                            openRecipeId ===
                                                            product.id
                                                        }
                                                        onClick={() =>
                                                            toggleRecipe(
                                                                product.id
                                                            )
                                                        }
                                                    >
                                                        {openRecipeId ===
                                                        product.id
                                                            ? "✕ Close Recipe"
                                                            : "📖 Recipe"}
                                                    </button>

                                                    {/* EXISTING AVAILABILITY ACTION */}
                                                    <button
                                                        type="button"
                                                        className="product-status-button"
                                                        onClick={() =>
                                                            toggleAvailability(
                                                                product
                                                            )
                                                        }
                                                    >
                                                        {product.is_available
                                                            ? "Disable"
                                                            : "Enable"}
                                                    </button>

                                                    {/* EXISTING DELETE ACTION */}
                                                    <button
                                                        type="button"
                                                        className="product-delete-button"
                                                        onClick={() =>
                                                            handleDelete(product)
                                                        }
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* EXPANDABLE RECIPE ROW: directly below its product */}
                                        {openRecipeId === product.id && (
                                            <tr
                                                key={`recipe-${product.id}`}
                                                className="recipe-expanded-row"
                                            >
                                                <td colSpan="5">
                                                    <section className="recipe-editor-card">
                                                        <header className="recipe-editor-header">
                                                            <div>
                                                                <p className="products-eyebrow">
                                                                    PRODUCT RECIPE
                                                                </p>
                                                                <h2>
                                                                    ☕{" "}
                                                                    {product.name}
                                                                </h2>
                                                                <p>
                                                                    Organize the
                                                                    recipe into
                                                                    sections,
                                                                    subsections,
                                                                    and flexible
                                                                    ingredient or
                                                                    instruction
                                                                    items.
                                                                </p>
                                                            </div>
                                                        </header>

                                                        {/* RECIPE LOADING STATE */}
                                                        {loadingRecipeId ===
                                                        product.id ? (
                                                            <p>
                                                                Loading recipe
                                                                from the
                                                                database...
                                                            </p>
                                                        ) : (
                                                            <>
                                                                {/* ADD MAIN SECTION */}
                                                                <div className="recipe-editor-toolbar">
                                                                    <button
                                                                        type="button"
                                                                        className="add-product-button"
                                                                        onClick={() =>
                                                                            addSection(
                                                                                product.id
                                                                            )
                                                                        }
                                                                    >
                                                                        + Add Main
                                                                        Section
                                                                    </button>
                                                                </div>

                                                                {/* MAIN SECTIONS */}
                                                                {(recipes[
                                                                    product.id
                                                                ] || []).length ===
                                                                0 ? (
                                                                    <p className="recipe-empty-message">
                                                                        No
                                                                        sections
                                                                        yet. Add
                                                                        a main
                                                                        section
                                                                        to start
                                                                        building
                                                                        this
                                                                        recipe.
                                                                    </p>
                                                                ) : (
                                                                    <div className="recipe-sections-list">
                                                                        {(
                                                                            recipes[
                                                                                product.id
                                                                            ] || []
                                                                        ).map(
                                                                            (
                                                                                section,
                                                                                sectionIndex
                                                                            ) => (
                                                                                <article
                                                                                    className="recipe-main-section"
                                                                                    key={
                                                                                        section.id
                                                                                    }
                                                                                >
                                                                                    {/* SECTION TITLE */}
                                                                                    <div className="recipe-section-heading">
                                                                                        
                                                                                        <label className="recipe-title-field">
                                                                                            Main
                                                                                            section
                                                                                            title
                                                                                            <input
                                                                                                value={
                                                                                                    section.title
                                                                                                }
                                                                                                onChange={(
                                                                                                    event
                                                                                                ) =>
                                                                                                    updateSection(
                                                                                                        product.id,
                                                                                                        section.id,
                                                                                                        {
                                                                                                            title: event
                                                                                                                .target
                                                                                                                .value,
                                                                                                        }
                                                                                                    )
                                                                                                }
                                                                                                placeholder="e.g. Cappuccino preparation"
                                                                                            />
                                                                                        </label>
                                                                                        <button
                                                                                            type="button"
                                                                                            className="product-delete-button"
                                                                                            onClick={() =>
                                                                                                removeSection(
                                                                                                    product.id,
                                                                                                    section.id
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            Remove
                                                                                            section
                                                                                        </button>
                                                                                    </div>

                                                                                    <h3>
                                                                                        {
                                                                                            section.emoji
                                                                                        }{" "}
                                                                                        {
                                                                                            section.title
                                                                                        }
                                                                                    </h3>

                                                                                    {/* ADD SUBSECTION */}
                                                                                    <button
                                                                                        type="button"
                                                                                        className="product-status-button"
                                                                                        onClick={() =>
                                                                                            addSubsection(
                                                                                                product.id,
                                                                                                section.id
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        + Add
                                                                                        Subsection
                                                                                    </button>

                                                                                    {/* SUBSECTIONS */}
                                                                                    {section.subsections.map(
                                                                                        (
                                                                                            subsection
                                                                                        ) => (
                                                                                            <div
                                                                                                className="recipe-subsection"
                                                                                                key={
                                                                                                    subsection.id
                                                                                                }
                                                                                            >
                                                                                                <div className="recipe-subsection-heading">
                                                                                                    
                                                                                                    
                                                                                                    <label className="recipe-title-field">
                                                                                                        Subsection
                                                                                                        title
                                                                                                        <input
                                                                                                            value={
                                                                                                                subsection.title
                                                                                                            }
                                                                                                            onChange={(
                                                                                                                event
                                                                                                            ) =>
                                                                                                                updateSubsection(
                                                                                                                    product.id,
                                                                                                                    section.id,
                                                                                                                    subsection.id,
                                                                                                                    {
                                                                                                                        title: event
                                                                                                                            .target
                                                                                                                            .value,
                                                                                                                    }
                                                                                                                )
                                                                                                            }
                                                                                                            placeholder="e.g. Ingredients"
                                                                                                        />
                                                                                                    </label>
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        className="product-delete-button"
                                                                                                        onClick={() =>
                                                                                                            removeSubsection(
                                                                                                                product.id,
                                                                                                                section.id,
                                                                                                                subsection.id
                                                                                                            )
                                                                                                        }
                                                                                                    >
                                                                                                        Remove
                                                                                                        subsection
                                                                                                    </button>
                                                                                                </div>

                                                                                                <h4>
                                                                                                    {
                                                                                                        subsection.emoji
                                                                                                    }{" "}
                                                                                                    {
                                                                                                        subsection.title
                                                                                                    }
                                                                                                </h4>

                                                                                                {/* ITEMS WITH OPTIONAL QUANTITY, UNIT, AND NOTES */}
                                                                                                <div className="recipe-items-list">
                                                                                                    {subsection.items.map(
                                                                                                        (
                                                                                                            item
                                                                                                        ) => (
                                                                                                            <div
                                                                                                                className="recipe-item-row"
                                                                                                                key={
                                                                                                                    item.id
                                                                                                                }
                                                                                                            >
                                                                                                                <label>
                                                                                                                    Item /
                                                                                                                    ingredient /
                                                                                                                    instruction
                                                                                                                    <input
                                                                                                                        value={
                                                                                                                            item.name
                                                                                                                        }
                                                                                                                        onChange={(
                                                                                                                            event
                                                                                                                        ) =>
                                                                                                                            updateRecipeItem(
                                                                                                                                product.id,
                                                                                                                                section.id,
                                                                                                                                subsection.id,
                                                                                                                                item.id,
                                                                                                                                {
                                                                                                                                    name: event
                                                                                                                                        .target
                                                                                                                                        .value,
                                                                                                                                }
                                                                                                                            )
                                                                                                                        }
                                                                                                                        placeholder="e.g. Espresso, milk, or whisk for 20 seconds"
                                                                                                                    />
                                                                                                                </label>
                                                                                                                <label>
                                                                                                                    Quantity
                                                                                                                    (optional)
                                                                                                                    <input
                                                                                                                        value={
                                                                                                                            item.quantity
                                                                                                                        }
                                                                                                                        onChange={(
                                                                                                                            event
                                                                                                                        ) =>
                                                                                                                            updateRecipeItem(
                                                                                                                                product.id,
                                                                                                                                section.id,
                                                                                                                                subsection.id,
                                                                                                                                item.id,
                                                                                                                                {
                                                                                                                                    quantity: event
                                                                                                                                        .target
                                                                                                                                        .value,
                                                                                                                                }
                                                                                                                            )
                                                                                                                        }
                                                                                                                        placeholder="e.g. 150"
                                                                                                                    />
                                                                                                                </label>
                                                                                                                <label>
                                                                                                                    Unit
                                                                                                                    (optional)
                                                                                                                    <input
                                                                                                                        value={
                                                                                                                            item.unit
                                                                                                                        }
                                                                                                                        onChange={(
                                                                                                                            event
                                                                                                                        ) =>
                                                                                                                            updateRecipeItem(
                                                                                                                                product.id,
                                                                                                                                section.id,
                                                                                                                                subsection.id,
                                                                                                                                item.id,
                                                                                                                                {
                                                                                                                                    unit: event
                                                                                                                                        .target
                                                                                                                                        .value,
                                                                                                                                }
                                                                                                                            )
                                                                                                                        }
                                                                                                                        placeholder="ml, g, shot..."
                                                                                                                    />
                                                                                                                </label>
                                                                                                                <label className="recipe-note-field">
                                                                                                                    Note /
                                                                                                                    details
                                                                                                                    (optional)
                                                                                                                    <input
                                                                                                                        value={
                                                                                                                            item.note
                                                                                                                        }
                                                                                                                        onChange={(
                                                                                                                            event
                                                                                                                        ) =>
                                                                                                                            updateRecipeItem(
                                                                                                                                product.id,
                                                                                                                                section.id,
                                                                                                                                subsection.id,
                                                                                                                                item.id,
                                                                                                                                {
                                                                                                                                    note: event
                                                                                                                                        .target
                                                                                                                                        .value,
                                                                                                                                }
                                                                                                                            )
                                                                                                                        }
                                                                                                                        placeholder="Extra details or preparation notes"
                                                                                                                    />
                                                                                                                </label>
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    className="product-delete-button"
                                                                                                                    onClick={() =>
                                                                                                                        removeRecipeItem(
                                                                                                                            product.id,
                                                                                                                            section.id,
                                                                                                                            subsection.id,
                                                                                                                            item.id
                                                                                                                        )
                                                                                                                    }
                                                                                                                >
                                                                                                                    Remove
                                                                                                                    item
                                                                                                                </button>
                                                                                                            </div>
                                                                                                        )
                                                                                                    )}
                                                                                                </div>

                                                                                                <button
                                                                                                    type="button"
                                                                                                    className="product-status-button"
                                                                                                    onClick={() =>
                                                                                                        addRecipeItem(
                                                                                                            product.id,
                                                                                                            section.id,
                                                                                                            subsection.id
                                                                                                        )
                                                                                                    }
                                                                                                >
                                                                                                    + Add
                                                                                                    Item
                                                                                                </button>
                                                                                            </div>
                                                                                        )
                                                                                    )}
                                                                                </article>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* SAVE ALL RECIPE CHANGES TO DATABASE */}
                                                                <footer className="recipe-editor-footer">
                                                                    <button
                                                                        type="button"
                                                                        className="add-product-button"
                                                                        onClick={() =>
                                                                            saveRecipe(
                                                                                product.id
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            savingRecipeId ===
                                                                            product.id
                                                                        }
                                                                    >
                                                                        {savingRecipeId ===
                                                                        product.id
                                                                            ? "Saving recipe..."
                                                                            : "💾 Save Recipe"}
                                                                    </button>
                                                                </footer>
                                                            </>
                                                        )}
                                                    </section>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </main>
    );
}

// ============================================================
// SECTION 14 — EXPORT COMPONENT FOR REACT ROUTER
// ============================================================

export default Products;
