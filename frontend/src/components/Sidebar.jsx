import { NavLink } from "react-router-dom";

function Sidebar({ isOpen, closeMenu }) {

    const navigation = [
        ["Dashboard", "/dashboard", "▣"],
        ["Orders", "/orders", "▤"],
        ["Products", "/products", "☕"],
        ["Inventory", "/inventory", "▥"],
        ["Employees", "/employees", "♙"],
        ["Reports", "/reports", "◫"]
    ];

    return (
        <aside className={`sidebar ${isOpen ? "open" : ""}`}>

            <div className="sidebar-brand">
                <div className="brand-icon">☕</div>

                <div>
                    <h2>Cafe</h2>
                    <span>Management</span>
                </div>
            </div>

            <nav className="sidebar-nav">

                <p className="nav-title">
                    MAIN MENU
                </p>

                {navigation.map(([name, path, icon]) => (
                    <NavLink
                        key={path}
                        to={path}
                        onClick={closeMenu}
                        className={({ isActive }) =>
                            isActive
                                ? "nav-link active"
                                : "nav-link"
                        }
                    >
                        <span className="nav-icon">
                            {icon}
                        </span>

                        <span>
                            {name}
                        </span>
                    </NavLink>
                ))}

            </nav>

            <div className="sidebar-footer">
                <div className="user-avatar">
                    A
                </div>

                <div className="user-info">
                    <strong>Admin</strong>
                    <span>Administrator</span>
                </div>
            </div>

        </aside>
    );
}

export default Sidebar;