import { useState } from "react";
import Sidebar from "./Sidebar";

function Layout({ children }) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className="layout">

            <button
                className="mobile-menu-button"
                onClick={() => setMenuOpen(!menuOpen)}
            >
                ☰
            </button>

            <Sidebar
                isOpen={menuOpen}
                closeMenu={() => setMenuOpen(false)}
            />

            <main
                className="main-content"
                onClick={() => setMenuOpen(false)}
            >
                {children}
            </main>

        </div>
    );
}

export default Layout;