import { useState } from "react";
import { useNavigate } from "react-router-dom";
import login from "../services/authService";
import "./Login.css";

function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("employee");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleLogin() {
        if (email === "" || password === "") {
            setError("Please fill all fields");
            return;
        }

        setError("");
        setLoading(true);

        try {
            const data = await login(email, password, role);

            console.log("Login successful:", data);

                if (data.user.role === "admin") {
                    navigate("/dashboard");
                } else if (data.user.role === "employee") {
                    navigate("/dashboard");
                }

        } catch (error) {
            console.error(error);
            setError(
                error.message || "Invalid email, password, or account type"
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-container">

            <h1 className="title">
                Cafe Management System
            </h1>

            <div className="role-buttons">

                <button
                    type="button"
                    className={role === "admin" ? "role-button active" : "role-button"}
                    onClick={() => setRole("admin")}
                >
                    Admin
                </button>

                <button
                    type="button"
                    className={role === "employee" ? "role-button active" : "role-button"}
                    onClick={() => setRole("employee")}
                >
                    Employee
                </button>

            </div>

            <input
                className="input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />

            <br />
            <br />

            <input
                className="input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />

            <br />
            <br />

            {error && (
                <p className="error">
                    {error}
                </p>
            )}

            <button
                className="login-button"
                onClick={handleLogin}
                disabled={loading}
            >
                {loading ? "Loading..." : "Login"}
            </button>

        </div>
    );
}

export default Login;