import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "./api";

const tabs = [
  { id: "dashboard", label: "Dashboard", glyph: "D" },
  { id: "products", label: "Products", glyph: "P" },
  { id: "sales", label: "Sales", glyph: "S" },
  { id: "inventory", label: "Inventory", glyph: "I" },
  { id: "settings", label: "Settings", glyph: "T" },
];

const emptyProductForm = {
  name: "",
  category: "",
  price: "",
  initialStockQuantity: "",
  lowStockThreshold: "5",
};

const emptySaleForm = {
  productId: "",
  quantitySold: "",
};

const emptyRestockForm = {
  productId: "",
  quantityAdded: "",
  note: "",
};

const defaultLoginForm = {
  email: "",
  password: "",
};

const defaultSignupForm = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function badgeTone(product) {
  if (product.stock_quantity === 0) return "critical";
  if (product.stock_quantity <= product.low_stock_threshold) return "warning";
  return "healthy";
}

function StatCard({ hint, label, value }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </div>
  );
}

function EmptyState({ title, copy }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [saleForm, setSaleForm] = useState(emptySaleForm);
  const [restockForm, setRestockForm] = useState(emptyRestockForm);
  const [editingProductId, setEditingProductId] = useState(null);
  const [search, setSearch] = useState("");
  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [signupForm, setSignupForm] = useState(defaultSignupForm);
  const [authMode, setAuthMode] = useState("signin");

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  async function loadAllData() {
    setLoading(true);
    setError("");

    try {
      const [dashboardData, productData, salesData, historyData] = await Promise.all([
        api.getDashboard(),
        api.getProducts(),
        api.getSales(),
        api.getInventoryHistory(),
      ]);

      setDashboard(dashboardData);
      setProducts(productData);
      setSales(salesData);
      setHistory(historyData);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function bootstrapSession() {
      try {
        const session = await api.getCurrentUser();
        if (!active) return;
        setCurrentUser(session.user);
      } catch {
        if (!active) return;
        setCurrentUser(null);
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    bootstrapSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    loadAllData();
  }, [currentUser]);

  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const filteredProducts = useMemo(() => {
    if (!deferredSearch) return products;
    return products.filter((product) => {
      const haystack = [product.name, product.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(deferredSearch);
    });
  }, [deferredSearch, products]);

  const topProducts = useMemo(
    () =>
      [...products]
        .sort((left, right) => right.units_sold - left.units_sold)
        .slice(0, 5),
    [products],
  );
  const userInitials = useMemo(() => {
    if (!currentUser?.full_name) return "SF";
    return currentUser.full_name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }, [currentUser]);

  function resetProductForm() {
    setProductForm(emptyProductForm);
    setEditingProductId(null);
  }

  function handleTabChange(nextTab) {
    startTransition(() => setActiveTab(nextTab));
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    setCurrentUser(null);
    setDashboard(null);
    setProducts([]);
    setSales([]);
    setHistory([]);
    setMessage("");
    setError("");
    setActiveTab("dashboard");
    setLoginForm(defaultLoginForm);
    setSignupForm(defaultSignupForm);
    setAuthMode("signin");
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const session = await api.login(loginForm);
      setCurrentUser(session.user);
      setMessage(`Welcome back, ${session.user.full_name}.`);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignupSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    if (signupForm.password !== signupForm.confirmPassword) {
      setError("Passwords do not match.");
      setSubmitting(false);
      return;
    }

    try {
      const session = await api.signup({
        fullName: signupForm.fullName,
        email: signupForm.email,
        password: signupForm.password,
      });
      setCurrentUser(session.user);
      setSignupForm(defaultSignupForm);
      setMessage(`Welcome to StockFlow, ${session.user.full_name}.`);
    } catch (signupError) {
      setError(signupError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProductSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        ...productForm,
        price: Number(productForm.price),
        initialStockQuantity: Number(productForm.initialStockQuantity || 0),
        lowStockThreshold: Number(productForm.lowStockThreshold || 0),
      };

      if (editingProductId) {
        await api.updateProduct(editingProductId, payload);
        setMessage("Product updated successfully.");
      } else {
        await api.createProduct(payload);
        setMessage("Product added successfully.");
      }

      resetProductForm();
      await loadAllData();
      handleTabChange("products");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await api.createSale({
        productId: Number(saleForm.productId),
        quantitySold: Number(saleForm.quantitySold),
      });
      setSaleForm(emptySaleForm);
      setMessage("Sale recorded and stock updated.");
      await loadAllData();
      handleTabChange("sales");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestockSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await api.restockProduct({
        productId: Number(restockForm.productId),
        quantityAdded: Number(restockForm.quantityAdded),
        note: restockForm.note,
      });
      setRestockForm(emptyRestockForm);
      setMessage("Inventory updated successfully.");
      await loadAllData();
      handleTabChange("inventory");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteProduct(productId) {
    const confirmed = window.confirm("Delete this product? This cannot be undone.");
    if (!confirmed) return;

    setSubmitting(true);
    setError("");

    try {
      await api.deleteProduct(productId);
      setMessage("Product deleted.");
      if (editingProductId === productId) {
        resetProductForm();
      }
      await loadAllData();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleEditProduct(product) {
    setProductForm({
      name: product.name,
      category: product.category || "",
      price: String(product.price),
      initialStockQuantity: "",
      lowStockThreshold: String(product.low_stock_threshold),
    });
    setEditingProductId(product.id);
    handleTabChange("products");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const selectedSaleProduct = products.find(
    (product) => product.id === Number(saleForm.productId),
  );
  const selectedRestockProduct = products.find(
    (product) => product.id === Number(restockForm.productId),
  );
  const stockHealth = dashboard?.totals?.units_in_stock
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            ((dashboard.totals.units_in_stock - (dashboard.totals.low_stock_count || 0)) /
              dashboard.totals.units_in_stock) *
              100,
          ),
        ),
      )
    : 100;
  const weeklyTargetProgress = dashboard?.weekSales?.revenue
    ? Math.min(100, Math.round((dashboard.weekSales.revenue / 250000) * 100))
    : 0;
  const financialRecordProgress = weeklyTargetProgress;
  const weeklyRevenue = dashboard?.weekSales?.revenue ?? 0;
  const weeklyTransactions = dashboard?.weekSales?.transaction_count ?? 0;
  const chartValues = [
    Math.max(1, dashboard?.todaySales?.transaction_count ?? 1),
    Math.max(1, dashboard?.todaySales?.units_sold ?? 1),
    Math.max(1, dashboard?.weekSales?.transaction_count ?? 1),
    Math.max(1, dashboard?.totals?.total_products ?? 1),
    Math.max(1, dashboard?.totals?.low_stock_count ?? 1),
    Math.max(1, Math.round((dashboard?.totals?.units_in_stock ?? 1) / 5)),
  ];
  const chartMax = Math.max(...chartValues, 1);
  const chartPath = chartValues
    .map((value, index) => {
      const x = 20 + index * 58;
      const y = 132 - (value / chartMax) * 88;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  if (authLoading) {
    return (
      <section className="loading-state auth-screen">
        <div className="spinner" />
        <p>Checking your session...</p>
      </section>
    );
  }

  if (!currentUser) {
    return (
      <section className="auth-screen">
        <div className="auth-card">
          <p className="eyebrow">Secure access</p>
          <h1>{authMode === "signin" ? "Sign in to StockFlow" : "Create your StockFlow account"}</h1>
          <p className="auth-copy">
            {authMode === "signin"
              ? "Access your inventory workspace and keep sales, stock, and reports protected."
              : "Set up a new workspace account for managing products, sales, and stock movement."}
          </p>

          {error ? <div className="toast error">{error}</div> : null}

          <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={authMode === "signin" ? "active" : ""}
              onClick={() => {
                setAuthMode("signin");
                setError("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={authMode === "signup" ? "active" : ""}
              onClick={() => {
                setAuthMode("signup");
                setError("");
              }}
            >
              Sign up
            </button>
          </div>

          {authMode === "signin" ? (
            <form className="form-grid auth-form" onSubmit={handleLoginSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                  required
                />
              </label>

              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </button>
            </form>
          ) : (
            <form className="form-grid auth-form" onSubmit={handleSignupSubmit}>
              <label>
                Full name
                <input
                  value={signupForm.fullName}
                  onChange={(event) =>
                    setSignupForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={signupForm.email}
                  onChange={(event) =>
                    setSignupForm((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  minLength="8"
                  value={signupForm.password}
                  onChange={(event) =>
                    setSignupForm((current) => ({ ...current, password: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Confirm password
                <input
                  type="password"
                  minLength="8"
                  value={signupForm.confirmPassword}
                  onChange={(event) =>
                    setSignupForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? "Creating account..." : "Create account"}
              </button>
            </form>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-mark">SF</div>
          <p className="eyebrow">Inventory Control</p>
          <h1>StockFlow</h1>
          <p className="brand-copy">
            Inventory operations with a finance-dashboard feel.
          </p>
          <div className="brand-status">
            <span className="status-dot" />
            <span>System active</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => handleTabChange(tab.id)}
            >
              <span className="nav-glyph">{tab.glyph}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-panel">
          <span className="panel-label">Today</span>
          <strong>{new Intl.DateTimeFormat("en-NG", { dateStyle: "full" }).format(new Date())}</strong>
        </div>

        <div className="sidebar-panel">
          <span className="panel-label">Low stock</span>
          <strong>{dashboard?.totals?.low_stock_count ?? 0} item(s)</strong>
        </div>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-mini sidebar-mini-wide" onClick={() => handleTabChange("settings")}>
            Settings
          </button>
          <button type="button" className="sidebar-mini sidebar-mini-wide" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="search-shell">
            <span className="search-icon">Q</span>
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
            />
          </div>

          <div className="topbar-actions topbar-actions-wide">
            <button type="button" className="ghost-button" onClick={() => handleTabChange("sales")}>
              Record sale
            </button>
            <button type="button" className="primary-button" onClick={() => handleTabChange("products")}>
              Add product
            </button>
            <div className="user-chip">
              <span className="user-avatar">{userInitials}</span>
              <span className="user-name">{currentUser.full_name}</span>
            </div>
          </div>
        </header>

        {message ? <div className="toast success">{message}</div> : null}
        {error ? <div className="toast error">{error}</div> : null}

        {loading ? (
          <section className="loading-state">
            <div className="spinner" />
            <p>Loading inventory data...</p>
          </section>
        ) : (
          <>
            <section className="view-intro">
              <div className="topbar-copy">
                <p className="eyebrow">MVP Inventory Suite</p>
                <h2>Track products, sales, and stock movement in one flow.</h2>
                <p className="topbar-subcopy">
                  A tailored operating view inspired by premium finance dashboards.
                </p>
              </div>
            </section>

            {activeTab === "dashboard" ? (
              <section className="dashboard-layout">
                <div className="dashboard-board">
                  <div className="dashboard-board-header">
                    <div>
                      <p className="panel-label">Dashboard</p>
                      <h3>Inventory overview</h3>
                    </div>
                    <div className="dashboard-header-actions">
                      <span className="mini-orb" />
                      <span className="mini-orb dark" />
                    </div>
                  </div>

                  <div className="dashboard-top-grid">
                    <div className="finance-card">
                      <div className="finance-chip-row">
                        <span className="finance-chip">LIVE</span>
                        <span className="finance-icon">S</span>
                      </div>
                      <div className="finance-balance-row">
                        <div>
                          <p className="panel-label">Today&apos;s sales</p>
                          <strong>{formatCurrency(dashboard?.todaySales?.revenue ?? 0)}</strong>
                        </div>
                        <div className="finance-balance-meta">
                          <span>Balance</span>
                        </div>
                      </div>
                      <p className="finance-number">
                        {dashboard?.todaySales?.transaction_count ?? 0} transaction(s) today
                      </p>
                      <div className="finance-card-footer">
                        <div>
                          <span className="panel-label">Units sold</span>
                          <strong>{dashboard?.todaySales?.units_sold ?? 0}</strong>
                        </div>
                        <div>
                          <span className="panel-label">Products</span>
                          <strong>{dashboard?.totals?.total_products ?? 0}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="card-info-panel">
                      <div className="panel-heading compact">
                        <div>
                          <p className="panel-label">Card info</p>
                          <h3>Stock summary</h3>
                        </div>
                        <button type="button" className="tiny-button">
                          Details
                        </button>
                      </div>
                      <div className="info-grid">
                        <div className="info-cell">
                          <span>Units in stock</span>
                          <strong>{dashboard?.totals?.units_in_stock ?? 0}</strong>
                        </div>
                        <div className="info-cell">
                          <span>Status</span>
                          <strong>{dashboard?.totals?.low_stock_count ? "Watch list" : "Active"}</strong>
                        </div>
                        <div className="info-cell">
                          <span>Weekly sales</span>
                          <strong>{formatCurrency(dashboard?.weekSales?.revenue ?? 0)}</strong>
                        </div>
                        <div className="info-cell">
                          <span>Low stock</span>
                          <strong>{dashboard?.totals?.low_stock_count ?? 0}</strong>
                        </div>
                        <div className="info-cell">
                          <span>Transactions</span>
                          <strong>{dashboard?.weekSales?.transaction_count ?? 0}</strong>
                        </div>
                        <div className="info-cell">
                          <span>Mode</span>
                          <strong>Realtime</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="dashboard-middle-grid">
                    <div className="upcoming-panel">
                      <div className="panel-heading compact">
                        <div>
                          <p className="panel-label">Upcoming payment</p>
                          <h3>Quick actions</h3>
                        </div>
                      </div>
                      <div className="upcoming-cards">
                        <button type="button" className="action-card" onClick={() => handleTabChange("sales")}>
                          <span className="action-icon">S</span>
                          <strong>Record sale</strong>
                          <p>Capture transactions</p>
                          <span className="action-amount">{formatCurrency(dashboard?.todaySales?.revenue ?? 0)}</span>
                        </button>
                        <button type="button" className="action-card pale" onClick={() => handleTabChange("inventory")}>
                          <span className="action-icon">R</span>
                          <strong>Restock</strong>
                          <p>Increase quantities</p>
                          <span className="action-amount">{dashboard?.totals?.units_in_stock ?? 0} units</span>
                        </button>
                      </div>
                    </div>

                    <div className="activity-panel">
                      <div className="panel-heading compact">
                        <div>
                          <p className="panel-label">Your activity</p>
                          <h3>Movement trend</h3>
                        </div>
                        <div className="activity-tabs">
                          <span>Day</span>
                          <span>Week</span>
                          <span>Month</span>
                          <span>Year</span>
                        </div>
                      </div>
                      <div className="chart-card">
                        <svg viewBox="0 0 340 150" className="activity-chart" aria-hidden="true">
                          <line x1="18" y1="125" x2="320" y2="125" />
                          <line x1="18" y1="95" x2="320" y2="95" />
                          <line x1="18" y1="65" x2="320" y2="65" />
                          <line x1="18" y1="35" x2="320" y2="35" />
                          <path d={chartPath} />
                        </svg>
                        <div className="chart-labels">
                          <span>Mon</span>
                          <span>Tue</span>
                          <span>Wed</span>
                          <span>Thu</span>
                          <span>Fri</span>
                          <span>Sat</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="transactions-panel">
                    <div className="panel-heading compact">
                      <div>
                        <p className="panel-label">All transaction</p>
                        <h3>Recent activity</h3>
                      </div>
                      <span className="panel-label">Today</span>
                    </div>
                    <div className="transaction-list">
                      {dashboard?.recentTransactions?.length ? (
                        dashboard.recentTransactions.map((transaction) => (
                          <div
                            className="transaction-row"
                            key={`${transaction.type}-${transaction.created_at}-${transaction.product_name}`}
                          >
                            <div className="transaction-left">
                              <span className="transaction-dot">{transaction.type === "SALE" ? "S" : "A"}</span>
                              <div>
                                <strong>{transaction.product_name}</strong>
                                <p>
                                  {transaction.type === "SALE"
                                    ? `${transaction.quantity} unit(s) sold`
                                    : `${transaction.quantity} unit(s) added`}
                                </p>
                              </div>
                            </div>
                            <div className="transaction-right">
                              <span>{formatDate(transaction.created_at)}</span>
                              <strong>
                                {transaction.value ? formatCurrency(transaction.value) : `${transaction.quantity} units`}
                              </strong>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState title="No activity yet" copy="Sales and stock updates will show up here." />
                      )}
                    </div>
                  </div>
                </div>

                <div className="right-rail">
                  <div className="rail-card rail-card-primary">
                    <p className="panel-label">Financial record</p>
                    <div className="radial-shell">
                      <div
                        className="radial-ring"
                        style={{ "--record-progress": `${financialRecordProgress}%` }}
                      >
                        <strong>{financialRecordProgress}%</strong>
                        <span>Weekly target</span>
                      </div>
                    </div>
                    <div className="rail-split">
                      <span>Revenue</span>
                      <span>{formatCurrency(weeklyRevenue)}</span>
                    </div>
                    <p className="rail-copy">
                      {weeklyTransactions} transaction(s) recorded this week against a target of {formatCurrency(250000)}.
                    </p>
                  </div>

                  <div className="rail-card">
                    <p className="panel-label">Total savings</p>
                    <div className="progress-line">
                      <span style={{ width: `${weeklyTargetProgress}%` }} />
                    </div>
                    <strong>{weeklyTargetProgress}% complete</strong>
                    <p className="rail-copy">
                      Weekly revenue is {formatCurrency(dashboard?.weekSales?.revenue ?? 0)} against an internal target of {formatCurrency(250000)}.
                    </p>
                  </div>

                  <div className="rail-card rail-card-cta">
                    <p className="panel-label">Stock action</p>
                    <strong>Cash back up to 25%</strong>
                    <p className="rail-copy">
                      Jump straight into restocking and keep your balances accurate.
                    </p>
                    <button type="button" className="primary-button" onClick={() => handleTabChange("inventory")}>
                      Add stock
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "products" ? (
              <section className="content-grid products-grid">
                <div className="panel form-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="panel-label">Product management</p>
                      <h3>{editingProductId ? "Edit product" : "Add a new product"}</h3>
                    </div>
                    {editingProductId ? (
                      <button type="button" className="ghost-button" onClick={resetProductForm}>
                        Cancel edit
                      </button>
                    ) : null}
                  </div>

                  <form className="form-grid" onSubmit={handleProductSubmit}>
                    <label>
                      Product name
                      <input
                        required
                        value={productForm.name}
                        onChange={(event) =>
                          setProductForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="e.g. Dynasteez Signature Hoodie"
                      />
                    </label>

                    <label>
                      Category
                      <input
                        value={productForm.category}
                        onChange={(event) =>
                          setProductForm((current) => ({ ...current, category: event.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </label>

                    <label>
                      Price (NGN)
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={productForm.price}
                        onChange={(event) =>
                          setProductForm((current) => ({ ...current, price: event.target.value }))
                        }
                        placeholder="0"
                      />
                    </label>

                    {!editingProductId ? (
                      <label>
                        Initial stock quantity
                        <input
                          required
                          type="number"
                          min="0"
                          step="1"
                          value={productForm.initialStockQuantity}
                          onChange={(event) =>
                            setProductForm((current) => ({
                              ...current,
                              initialStockQuantity: event.target.value,
                            }))
                          }
                          placeholder="0"
                        />
                      </label>
                    ) : null}

                    <label>
                      Low stock alert threshold
                      <input
                        required
                        type="number"
                        min="0"
                        step="1"
                        value={productForm.lowStockThreshold}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            lowStockThreshold: event.target.value,
                          }))
                        }
                        placeholder="5"
                      />
                    </label>

                    <div className="form-actions">
                      <button type="submit" className="primary-button" disabled={submitting}>
                        {submitting ? "Saving..." : editingProductId ? "Update product" : "Save product"}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="panel-label">Product list</p>
                      <h3>Current inventory catalog</h3>
                    </div>

                    <label className="search-field">
                      <span>Search</span>
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Find a product"
                      />
                    </label>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Product</th>
                          <th>Price</th>
                          <th>In stock</th>
                          <th>Created</th>
                          <th>Sold</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.length ? (
                          filteredProducts.map((product) => (
                            <tr key={product.id}>
                              <td>#{product.id}</td>
                              <td>
                                <strong>{product.name}</strong>
                                <span>{product.category || "Uncategorized"}</span>
                              </td>
                              <td>{formatCurrency(product.price)}</td>
                              <td>{product.stock_quantity}</td>
                              <td>{formatDate(product.created_at)}</td>
                              <td>{product.units_sold}</td>
                              <td>
                                <span className={`stock-badge ${badgeTone(product)}`}>
                                  {product.stock_quantity <= product.low_stock_threshold ? "Low stock" : "Healthy"}
                                </span>
                              </td>
                              <td className="row-actions">
                                <button type="button" className="table-button" onClick={() => handleEditProduct(product)}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="table-button danger"
                                  onClick={() => handleDeleteProduct(product.id)}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="8">
                              <EmptyState title="No products found" copy="Try a different search or create a new item." />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "sales" ? (
              <section className="content-grid split-grid">
                <div className="panel form-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="panel-label">Sales recording</p>
                      <h3>Record a sale</h3>
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={handleSaleSubmit}>
                    <label>
                      Product
                      <select
                        required
                        value={saleForm.productId}
                        onChange={(event) =>
                          setSaleForm((current) => ({ ...current, productId: event.target.value }))
                        }
                      >
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Quantity sold
                      <input
                        required
                        type="number"
                        min="1"
                        step="1"
                        value={saleForm.quantitySold}
                        onChange={(event) =>
                          setSaleForm((current) => ({ ...current, quantitySold: event.target.value }))
                        }
                        placeholder="0"
                      />
                    </label>

                    {selectedSaleProduct ? (
                      <div className="context-card">
                        <span>Available stock</span>
                        <strong>{selectedSaleProduct.stock_quantity} unit(s)</strong>
                        <p>Unit price: {formatCurrency(selectedSaleProduct.price)}</p>
                      </div>
                    ) : null}

                    <div className="form-actions">
                      <button type="submit" className="primary-button" disabled={submitting}>
                        {submitting ? "Recording..." : "Record sale"}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="panel-label">Sales history</p>
                      <h3>Recent sales</h3>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Quantity</th>
                          <th>Total</th>
                          <th>Recorded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.length ? (
                          sales.map((sale) => (
                            <tr key={sale.id}>
                              <td>
                                <strong>{sale.product_name}</strong>
                                <span>{sale.product_category || "Uncategorized"}</span>
                              </td>
                              <td>{sale.quantity_sold}</td>
                              <td>{formatCurrency(sale.total_price)}</td>
                              <td>{formatDate(sale.created_at)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="4">
                              <EmptyState title="No sales yet" copy="Once you record a sale, it will appear here." />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "inventory" ? (
              <section className="content-grid split-grid">
                <div className="panel form-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="panel-label">Stock management</p>
                      <h3>Add stock</h3>
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={handleRestockSubmit}>
                    <label>
                      Product
                      <select
                        required
                        value={restockForm.productId}
                        onChange={(event) =>
                          setRestockForm((current) => ({ ...current, productId: event.target.value }))
                        }
                      >
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Quantity added
                      <input
                        required
                        type="number"
                        min="1"
                        step="1"
                        value={restockForm.quantityAdded}
                        onChange={(event) =>
                          setRestockForm((current) => ({
                            ...current,
                            quantityAdded: event.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </label>

                    <label>
                      Note
                      <textarea
                        rows="3"
                        value={restockForm.note}
                        onChange={(event) =>
                          setRestockForm((current) => ({ ...current, note: event.target.value }))
                        }
                        placeholder="Optional restock note"
                      />
                    </label>

                    {selectedRestockProduct ? (
                      <div className="context-card">
                        <span>Current stock</span>
                        <strong>{selectedRestockProduct.stock_quantity} unit(s)</strong>
                        <p>Threshold: {selectedRestockProduct.low_stock_threshold} unit(s)</p>
                      </div>
                    ) : null}

                    <div className="form-actions">
                      <button type="submit" className="primary-button" disabled={submitting}>
                        {submitting ? "Updating..." : "Add stock"}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="panel-label">Inventory audit trail</p>
                      <h3>Stock history</h3>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Type</th>
                          <th>Quantity</th>
                          <th>Note</th>
                          <th>Recorded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.length ? (
                          history.map((entry) => (
                            <tr key={entry.id}>
                              <td>{entry.product_name}</td>
                              <td>{entry.change_type}</td>
                              <td className={entry.quantity < 0 ? "negative" : "positive"}>
                                {entry.quantity > 0 ? `+${entry.quantity}` : entry.quantity}
                              </td>
                              <td>{entry.note || "-"}</td>
                              <td>{formatDate(entry.created_at)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5">
                              <EmptyState title="No stock updates yet" copy="Restocks and sales adjustments will show here." />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "settings" ? (
              <section className="content-grid split-grid">
                <div className="panel form-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="panel-label">Settings</p>
                      <h3>Workspace preferences</h3>
                    </div>
                  </div>

                  <div className="form-grid">
                    <label>
                      Business name
                      <input value="StockFlow Workspace" readOnly />
                    </label>
                    <label>
                      Currency
                      <input value="NGN" readOnly />
                    </label>
                    <label>
                      Inventory alerts
                      <input value="Enabled" readOnly />
                    </label>
                    <label>
                      Data mode
                      <input value="Realtime dashboard" readOnly />
                    </label>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="panel-label">Account</p>
                      <h3>Profile and system actions</h3>
                    </div>
                  </div>

                    <div className="settings-stack">
                      <div className="info-cell">
                        <span>User</span>
                        <strong>{currentUser.full_name}</strong>
                      </div>
                      <div className="info-cell">
                        <span>Role</span>
                        <strong>{currentUser.role?.charAt(0).toUpperCase() + currentUser.role?.slice(1)}</strong>
                      </div>
                      <div className="info-cell">
                        <span>Email</span>
                        <strong>{currentUser.email}</strong>
                      </div>
                      <div className="info-cell">
                        <span>Current date</span>
                        <strong>{new Intl.DateTimeFormat("en-NG", { dateStyle: "full" }).format(new Date())}</strong>
                    </div>
                    <button type="button" className="primary-button settings-logout" onClick={handleLogout}>
                      Log out
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
