import express from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, initializeDatabase } from "./db.js";

initializeDatabase();

const app = express();
const port = Number(process.env.PORT || 4000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "..", "dist");

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "stockflow-dev-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

const productSummaryQuery = `
  SELECT
    p.id,
    p.name,
    p.category,
    p.price,
    p.stock_quantity,
    p.initial_stock_quantity,
    p.low_stock_threshold,
    p.created_at,
    p.updated_at,
    COALESCE(SUM(s.quantity_sold), 0) AS units_sold,
    COALESCE(SUM(s.total_price), 0) AS revenue
  FROM products p
  LEFT JOIN sales s ON s.product_id = p.id
  GROUP BY p.id
  ORDER BY p.created_at DESC
`;

const saleDetailsQuery = `
  SELECT
    s.id,
    s.product_id,
    p.name AS product_name,
    p.category AS product_category,
    s.quantity_sold,
    s.unit_price,
    s.total_price,
    s.created_at
  FROM sales s
  JOIN products p ON p.id = s.product_id
  ORDER BY s.created_at DESC, s.id DESC
`;

function getProductSummaryById(productId) {
  return db.prepare(`
    SELECT
      p.id,
      p.name,
      p.category,
      p.price,
      p.stock_quantity,
      p.initial_stock_quantity,
      p.low_stock_threshold,
      p.created_at,
      p.updated_at,
      COALESCE(SUM(s.quantity_sold), 0) AS units_sold,
      COALESCE(SUM(s.total_price), 0) AS revenue
    FROM products p
    LEFT JOIN sales s ON s.product_id = p.id
    WHERE p.id = ?
    GROUP BY p.id
  `).get(productId);
}

function getSaleById(saleId) {
  return db.prepare(`
    SELECT
      s.id,
      s.product_id,
      p.name AS product_name,
      p.category AS product_category,
      s.quantity_sold,
      s.unit_price,
      s.total_price,
      s.created_at
    FROM sales s
    JOIN products p ON p.id = s.product_id
    WHERE s.id = ?
  `).get(saleId);
}

function getSafeUserById(userId) {
  return db.prepare(`
    SELECT id, full_name, email, role, created_at
    FROM users
    WHERE id = ?
  `).get(userId);
}

function normalizeAuthInput(body = {}) {
  return {
    fullName: String(body.fullName || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    password: String(body.password || ""),
  };
}

function validateSignupInput(input) {
  const errors = [];

  if (!input.fullName) {
    errors.push("Full name is required.");
  }
  if (!input.email || !input.email.includes("@")) {
    errors.push("A valid email address is required.");
  }
  if (input.password.length < 8) {
    errors.push("Password must be at least 8 characters.");
  }

  return errors;
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ errors: ["Please log in to continue."] });
  }

  const user = getSafeUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ errors: ["Your session is no longer valid."] });
  }

  req.user = user;
  return next();
}

function normalizeProductInput(body = {}) {
  return {
    name: String(body.name || "").trim(),
    category: String(body.category || "").trim(),
    price: Number(body.price),
    initialStockQuantity: Number(body.initialStockQuantity),
    lowStockThreshold: Number(body.lowStockThreshold ?? 5),
  };
}

function normalizeSaleInput(body = {}) {
  return {
    productId: Number(body.productId),
    quantitySold: Number(body.quantitySold),
  };
}

function normalizeRestockInput(body = {}) {
  return {
    productId: Number(body.productId),
    quantityAdded: Number(body.quantityAdded),
    note: String(body.note || "").trim(),
  };
}

function productValidationErrors(input, options = { requireInitialStock: true }) {
  const errors = [];

  if (!input.name) {
    errors.push("Product name is required.");
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    errors.push("Price must be a valid non-negative number.");
  }
  if (options.requireInitialStock && (!Number.isInteger(input.initialStockQuantity) || input.initialStockQuantity < 0)) {
    errors.push("Initial stock quantity must be a valid non-negative whole number.");
  }
  if (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0) {
    errors.push("Low stock threshold must be a valid non-negative whole number.");
  }

  return errors;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ errors: ["Email and password are required."] });
  }

  const userRecord = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!userRecord || !bcrypt.compareSync(password, userRecord.password_hash)) {
    return res.status(401).json({ errors: ["Invalid email or password."] });
  }

  req.session.userId = userRecord.id;
  return res.json({ user: getSafeUserById(userRecord.id) });
});

app.post("/api/auth/signup", (req, res) => {
  const input = normalizeAuthInput(req.body);
  const errors = validateSignupInput(input);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(input.email);
  if (existingUser) {
    return res.status(409).json({ errors: ["An account with this email already exists."] });
  }

  const result = db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role)
    VALUES (@full_name, @email, @password_hash, 'admin')
  `).run({
    full_name: input.fullName,
    email: input.email,
    password_hash: bcrypt.hashSync(input.password, 10),
  });

  req.session.userId = result.lastInsertRowid;
  return res.status(201).json({ user: getSafeUserById(result.lastInsertRowid) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.status(204).send();
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ errors: ["Not authenticated."] });
  }

  const user = getSafeUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ errors: ["Not authenticated."] });
  }

  return res.json({ user });
});

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth") || req.path === "/health") {
    return next();
  }
  return requireAuth(req, res, next);
});

app.get("/api/products", (_req, res) => {
  const rows = db.prepare(productSummaryQuery).all();
  res.json(rows);
});

app.post("/api/products", (req, res) => {
  const input = normalizeProductInput(req.body);
  const errors = productValidationErrors(input);

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, price, stock_quantity, initial_stock_quantity, low_stock_threshold)
    VALUES (@name, @category, @price, @stock_quantity, @initial_stock_quantity, @low_stock_threshold)
  `);

  const insertHistory = db.prepare(`
    INSERT INTO stock_history (product_id, change_type, quantity, note)
    VALUES (@product_id, 'INITIAL', @quantity, @note)
  `);

  const transaction = db.transaction(() => {
    const result = insertProduct.run({
      name: input.name,
      category: input.category || null,
      price: input.price,
      stock_quantity: input.initialStockQuantity,
      initial_stock_quantity: input.initialStockQuantity,
      low_stock_threshold: input.lowStockThreshold,
    });

    insertHistory.run({
      product_id: result.lastInsertRowid,
      quantity: input.initialStockQuantity,
      note: "Opening stock",
    });

    return result.lastInsertRowid;
  });

  const id = transaction();
  const product = getProductSummaryById(id);
  return res.status(201).json({ id, product });
});

app.put("/api/products/:id", (req, res) => {
  const productId = Number(req.params.id);
  const input = normalizeProductInput(req.body);
  const errors = productValidationErrors({ ...input, initialStockQuantity: 0 }, { requireInitialStock: false });

  if (!Number.isInteger(productId)) {
    return res.status(400).json({ errors: ["Invalid product ID."] });
  }
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!existing) {
    return res.status(404).json({ errors: ["Product not found."] });
  }

  db.prepare(`
    UPDATE products
    SET name = @name,
        category = @category,
        price = @price,
        low_stock_threshold = @low_stock_threshold,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id: productId,
    name: input.name,
    category: input.category || null,
    price: input.price,
    low_stock_threshold: input.lowStockThreshold,
  });

  const product = getProductSummaryById(productId);
  return res.json(product);
});

app.delete("/api/products/:id", (req, res) => {
  const productId = Number(req.params.id);

  if (!Number.isInteger(productId)) {
    return res.status(400).json({ errors: ["Invalid product ID."] });
  }

  const hasSales = db
    .prepare("SELECT EXISTS(SELECT 1 FROM sales WHERE product_id = ?) AS has_sales")
    .get(productId).has_sales;

  if (hasSales) {
    return res.status(409).json({
      errors: ["This product already has sales history and cannot be deleted."],
    });
  }

  const result = db.prepare("DELETE FROM products WHERE id = ?").run(productId);
  if (result.changes === 0) {
    return res.status(404).json({ errors: ["Product not found."] });
  }

  return res.status(204).send();
});

app.get("/api/sales", (_req, res) => {
  const sales = db.prepare(saleDetailsQuery).all();
  res.json(sales);
});

app.post("/api/sales", (req, res) => {
  const input = normalizeSaleInput(req.body);
  if (!Number.isInteger(input.productId) || !Number.isInteger(input.quantitySold) || input.quantitySold <= 0) {
    return res.status(400).json({ errors: ["Product and sold quantity must be valid values."] });
  }

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(input.productId);
  if (!product) {
    return res.status(404).json({ errors: ["Product not found."] });
  }
  if (product.stock_quantity < input.quantitySold) {
    return res.status(409).json({ errors: ["Insufficient stock for this sale."] });
  }

  const transaction = db.transaction(() => {
    const saleResult = db.prepare(`
      INSERT INTO sales (product_id, quantity_sold, unit_price, total_price)
      VALUES (@product_id, @quantity_sold, @unit_price, @total_price)
    `).run({
      product_id: input.productId,
      quantity_sold: input.quantitySold,
      unit_price: product.price,
      total_price: product.price * input.quantitySold,
    });

    db.prepare(`
      UPDATE products
      SET stock_quantity = stock_quantity - @quantity_sold,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @product_id
    `).run({
      product_id: input.productId,
      quantity_sold: input.quantitySold,
    });

    db.prepare(`
      INSERT INTO stock_history (product_id, change_type, quantity, note)
      VALUES (@product_id, 'SALE', @quantity, @note)
    `).run({
      product_id: input.productId,
      quantity: -input.quantitySold,
      note: `Sale recorded for ${input.quantitySold} unit(s)`,
    });

    return saleResult.lastInsertRowid;
  });

  const saleId = transaction();
  const sale = getSaleById(saleId);
  return res.status(201).json(sale);
});

app.post("/api/inventory/restock", (req, res) => {
  const input = normalizeRestockInput(req.body);
  if (!Number.isInteger(input.productId) || !Number.isInteger(input.quantityAdded) || input.quantityAdded <= 0) {
    return res.status(400).json({ errors: ["Product and added quantity must be valid values."] });
  }

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(input.productId);
  if (!product) {
    return res.status(404).json({ errors: ["Product not found."] });
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE products
      SET stock_quantity = stock_quantity + @quantity_added,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @product_id
    `).run({
      product_id: input.productId,
      quantity_added: input.quantityAdded,
    });

    db.prepare(`
      INSERT INTO stock_history (product_id, change_type, quantity, note)
      VALUES (@product_id, 'ADD', @quantity, @note)
    `).run({
      product_id: input.productId,
      quantity: input.quantityAdded,
      note: input.note || `Restocked ${input.quantityAdded} unit(s)`,
    });
  });

  transaction();
  const updatedProduct = getProductSummaryById(input.productId);
  return res.status(201).json(updatedProduct);
});

app.get("/api/inventory/history", (_req, res) => {
  const history = db.prepare(`
    SELECT
      h.id,
      h.product_id,
      p.name AS product_name,
      h.change_type,
      h.quantity,
      h.note,
      h.created_at
    FROM stock_history h
    JOIN products p ON p.id = h.product_id
    ORDER BY h.created_at DESC, h.id DESC
  `).all();

  res.json(history);
});

app.get("/api/dashboard", (_req, res) => {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_products,
      COALESCE(SUM(stock_quantity), 0) AS units_in_stock,
      COUNT(CASE WHEN stock_quantity <= low_stock_threshold THEN 1 END) AS low_stock_count
    FROM products
  `).get();

  const todaySales = db.prepare(`
    SELECT
      COALESCE(SUM(total_price), 0) AS revenue,
      COALESCE(SUM(quantity_sold), 0) AS units_sold,
      COUNT(*) AS transaction_count
    FROM sales
    WHERE date(created_at) = date('now', 'localtime')
  `).get();

  const weekSales = db.prepare(`
    SELECT
      COALESCE(SUM(total_price), 0) AS revenue,
      COALESCE(SUM(quantity_sold), 0) AS units_sold,
      COUNT(*) AS transaction_count
    FROM sales
    WHERE datetime(created_at) >= datetime('now', 'localtime', '-6 days')
  `).get();

  const lowStockProducts = db.prepare(`
    SELECT id, name, stock_quantity, low_stock_threshold
    FROM products
    WHERE stock_quantity <= low_stock_threshold
    ORDER BY stock_quantity ASC, name ASC
    LIMIT 5
  `).all();

  const recentTransactions = db.prepare(`
    SELECT *
    FROM (
      SELECT
        'SALE' AS type,
        p.name AS product_name,
        s.quantity_sold AS quantity,
        s.total_price AS value,
        s.created_at
      FROM sales s
      JOIN products p ON p.id = s.product_id

      UNION ALL

      SELECT
        h.change_type AS type,
        p.name AS product_name,
        h.quantity AS quantity,
        NULL AS value,
        h.created_at
      FROM stock_history h
      JOIN products p ON p.id = h.product_id
      WHERE h.change_type = 'ADD'
    )
    ORDER BY created_at DESC
    LIMIT 8
  `).all();

  res.json({
    totals,
    todaySales,
    weekSales,
    lowStockProducts,
    recentTransactions,
  });
});

app.use(express.static(distDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  return res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, () => {
  console.log(`StockFlow server running on http://localhost:${port}`);
});
