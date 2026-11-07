async function login(email, password, role) {
    const response = await fetch("http://localhost:5000/api/login", {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
        },

        body: JSON.stringify({
            email,
            password,
            role,
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Login failed");
    }

    return data;
}

export default login;
    