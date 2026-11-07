import { NavLink, useNavigate } from "react-router-dom";
import {
    ClipboardList,
    Coffee,
    FileText,
    LayoutDashboard,
    LogOut,
    Package,
    Users,
} from "lucide-react";

// Each area has its own colour (set in global.css with data-tone)
const navigation = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard, tone: "dashboard" },
    { name: "Orders", path: "/orders", icon: ClipboardList, tone: "orders" },
    { name: "Products", path: "/products", icon: Coffee, tone: "products" },
    { name: "Inventory", path: "/inventory", icon: Package, tone: "inventory" },
    { name: "Employees", path: "/employees", icon: Users, tone: "employees" },
    { name: "Reports", path: "/reports", icon: FileText, tone: "reports" },
];

function Sidebar({ isOpen, closeMenu }) {
    const navigate = useNavigate();

    function logout() {
        closeMenu();
        navigate("/login");
    }

    return (
        <aside className={`sidebar ${isOpen ? "open" : ""}`}>
            <div className="sidebar-brand">
                <div className="brand-icon">
                    <Coffee size={22} strokeWidth={2} />
                </div>

                <div className="brand-text">
                    <h2>Cafe</h2>
                    <span>Management</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                <p className="nav-title">Menu</p>

                {navigation.map(({ name, path, icon: Icon, tone }) => (
                    <NavLink
                        key={path}
                        to={path}
                        data-tone={tone}
                        title={name}
                        onClick={closeMenu}
                        className={({ isActive }) =>
                            isActive ? "nav-link active" : "nav-link"
                        }
                    >
                        <span className="nav-icon">
                            <Icon size={20} strokeWidth={2} />
                        </span>

                        <span className="nav-label">{name}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="user-avatar" title="Admin">A</div>

                <div className="user-info">
                    <strong>Admin</strong>
                    <span>Administrator</span>
                </div>

                <button
                    type="button"
                    className="logout-button"
                    onClick={logout}
                    title="Log out"
                    aria-label="Log out"
                >
                    <LogOut size={18} strokeWidth={2} />
                </button>
            </div>

        </aside>
    );
}

export default Sidebar;
