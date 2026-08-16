import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import Employees from "./pages/Employees";
import Reports from "./pages/Reports";
import Layout from "./components/Layout";

function App() {

    return (

        <BrowserRouter>

            <Routes>

    <Route path="/" element={<Login />} />

    <Route path="/login" element={<Login />} />


    <Route
        path="/dashboard"
        element={
            <Layout>
                <Dashboard />
            </Layout>
        }
    />


    <Route
        path="/products"
        element={
            <Layout>
                <Products />
            </Layout>
        }
    />


    <Route
        path="/orders"
        element={
            <Layout>
                <Orders />
            </Layout>
        }
    />


    <Route
        path="/inventory"
        element={
            <Layout>
                <Inventory />
            </Layout>
        }
    />


    <Route
        path="/employees"
        element={
            <Layout>
                <Employees />
            </Layout>
        }
    />


    <Route
        path="/reports"
        element={
            <Layout>
                <Reports />
            </Layout>
        }
    />

</Routes>

        </BrowserRouter>

    );

}


export default App;