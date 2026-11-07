import { useEffect, useState } from "react";
import { Clock, Menu } from "lucide-react";
import Sidebar from "./Sidebar";

function greeting() {
    const hour = new Date().getHours();

    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

function Layout({ children }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [now, setNow] = useState(() => new Date());

    // The clock in the top bar updates every 30 seconds
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    const dateText = now.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    const timeText = now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div className="layout">
            <Sidebar isOpen={menuOpen} closeMenu={() => setMenuOpen(false)} />

            {menuOpen && (
                <div
                    className="sidebar-backdrop"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden="true"
                />
            )}

            <div className="app-body">
                <header className="topbar">
                    <button
                        type="button"
                        className="topbar-menu"
                        onClick={() => setMenuOpen((open) => !open)}
                        aria-label="Toggle navigation"
                    >
                        <Menu size={20} />
                    </button>

                    <div className="topbar-greeting">
                        <strong>{greeting()}, Admin</strong>
                        <span>{dateText}</span>
                    </div>

                    <div className="topbar-right">
                        <span className="topbar-chip">
                            <Clock size={15} />
                            {timeText}
                        </span>
                    </div>
                </header>

                <main className="main-content">{children}</main>
            </div>
        </div>
    );
}

export default Layout;
