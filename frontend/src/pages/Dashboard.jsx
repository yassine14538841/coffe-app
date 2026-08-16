import "./Dashboard.css";
function Dashboard() {

    const sales = 1250;
    const orders = 42;
    const products = 86;
    const lowStock = 5;
    const recentOrders = [
    {
        id: 1,
        product: "Cappuccino",
        total: 8,
        status: "Paid"
    },
    {
        id: 2,
        product: "Latte + Croissant",
        total: 12,
        status: "Pending"
    },
    {
        id: 3,
        product: "Espresso",
        total: 5,
        status: "Paid"
    }
];


    return (

        <div className="dashboard">

            <h1>Dashboard</h1>

            <div className="cards">

                <div className="card">
                    <h3>Today's Sales</h3>
                    <p>{sales} DT</p>
                </div>

                <div className="card">
                    <h3>Orders</h3>
                    <p>{orders}</p>
                </div>

                <div className="card">
                    <h3>Products</h3>
                    <p>{products}</p>
                </div>

                <div className="card">
                    <h3>Low Stock</h3>
                    <p>{lowStock}</p>
                </div>


            </div>
            <div className="orders-section">

    <h2>Recent Orders</h2>

    <table>

        <thead>

            <tr>
                <th>Order</th>
                <th>Product</th>
                <th>Total</th>
                <th>Status</th>
            </tr>

        </thead>

        <tbody>

            {recentOrders.map((order) => (

                <tr key={order.id}>

                    <td>#{order.id}</td>

                    <td>{order.product}</td>

                    <td>{order.total} DT</td>

                    <td>{order.status}</td>

                </tr>

            ))}

        </tbody>

    </table>

</div>

        </div>

    );
}

export default Dashboard;