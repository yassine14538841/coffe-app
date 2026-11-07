
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import login from "../services/authService";
function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("employee");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    async function handleLogin(event) {
        event.preventDefault();

        if (email.trim() === "" || password === "") {
            setError("Please fill all fields");
            return;
        }

        setError("");
        setLoading(true);

        try {
            const data = await login(email, password, role);

            console.log("Login successful:", data);

            if (
                data.user.role === "admin" ||
                data.user.role === "employee"
            ) {
                navigate("/dashboard");
            }
        } catch (error) {
            console.error(error);
            setError(
                error.message ||
                "Invalid email, password, or account type"
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="login-page">
            <section className="login-card">

                <div className="login-brand-icon" aria-hidden="true">
                    ☕
                </div>

                <p className="login-eyebrow">
                    WELCOME TO YOUR CAFÉ
                </p>

                <h1 className="login-title">
                    Coffee <span>House</span>
                </h1>

                <p className="login-subtitle">
                    Café Management System
                </p>

                <div className="login-divider">
                    <span />
                    <span />
                    <span />
                </div>

                <form onSubmit={handleLogin}>
                    <label className="login-label">
                        Account type
                    </label>

                    <div className="login-role-selector">
                        <button
                            type="button"
                            className={
                                role === "admin"
                                    ? "login-role-button active"
                                    : "login-role-button"
                            }
                            onClick={() => setRole("admin")}
                            aria-pressed={role === "admin"}
                        >
                            Admin
                        </button>

                        <button
                            type="button"
                            className={
                                role === "employee"
                                    ? "login-role-button active"
                                    : "login-role-button"
                            }
                            onClick={() => setRole("employee")}
                            aria-pressed={role === "employee"}
                        >
                            Employee
                        </button>
                    </div>

                    <div className="login-field">
                        <label htmlFor="login-email" className="login-label">
                            Email address
                        </label>

                        <input
                            id="login-email"
                            className="login-input"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(event) =>
                                setEmail(event.target.value)
                            }
                            autoComplete="username"
                            required
                        />
                    </div>

                    <div className="login-field">
                        <label
                            htmlFor="login-password"
                            className="login-label"
                        >
                            Password
                        </label>

                        <input
                            id="login-password"
                            className="login-input"
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    {error && (
                        <p className="login-error" role="alert">
                            {error}
                        </p>
                    )}

                    <button
                        className="login-submit"
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? "Signing in..." : "Sign In"}
                        {!loading && <span aria-hidden="true"> →</span>}
                    </button>
                </form>

                <p className="login-footer">
                    Crafted with care, served with passion.
                </p>

            </section>
        </main>
    );
}

export default Login;
