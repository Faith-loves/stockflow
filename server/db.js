import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

const dataDir = path.resolve("data");
const dbPath = path.join(dataDir, "stockflow.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      price REAL NOT NULL CHECK(price >= 0),
      stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
      initial_stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(initial_stock_quantity >= 0),
      low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK(low_stock_threshold >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      quantity_sold INTEGER NOT NULL CHECK(quantity_sold > 0),
      unit_price REAL NOT NULL CHECK(unit_price >= 0),
      total_price REAL NOT NULL CHECK(total_price >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS stock_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      change_type TEXT NOT NULL CHECK(change_type IN ('INITIAL', 'ADD', 'SALE', 'ADJUST')),
      quantity INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  if (productCount === 0) {
    seedDatabase();
  }

  seedDefaultUser();
}

function seedDatabase() {
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, price, stock_quantity, initial_stock_quantity, low_stock_threshold)
    VALUES (@name, @category, @price, @stock_quantity, @initial_stock_quantity, @low_stock_threshold)
  `);

  const insertHistory = db.prepare(`
    INSERT INTO stock_history (product_id, change_type, quantity, note)
    VALUES (@product_id, @change_type, @quantity, @note)
  `);

  const seedProducts = [
    {
      name: "Dynasteez Graphic Tee",
      category: "T-Shirts",
      price: 12000,
      stock_quantity: 18,
      initial_stock_quantity: 18,
      low_stock_threshold: 6,
    },
    {
      name: "Dynasteez Cargo Shorts",
      category: "Bottoms",
      price: 18500,
      stock_quantity: 9,
      initial_stock_quantity: 9,
      low_stock_threshold: 4,
    },
    {
      name: "Canvas Tote Bag",
      category: "Accessories",
      price: 7500,
      stock_quantity: 24,
      initial_stock_quantity: 24,
      low_stock_threshold: 8,
    },
  ];

  const seed = db.transaction(() => {
    for (const product of seedProducts) {
      const result = insertProduct.run(product);
      insertHistory.run({
        product_id: result.lastInsertRowid,
        change_type: "INITIAL",
        quantity: product.initial_stock_quantity,
        note: "Seeded opening stock",
      });
    }
  });

  seed();
}

function seedDefaultUser() {
  const email = "admin@stockflow.local";
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);

  if (exists) {
    return;
  }

  db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role)
    VALUES (@full_name, @email, @password_hash, @role)
  `).run({
    full_name: "Joy Dev",
    email,
    password_hash: bcrypt.hashSync("Stockflow@123", 10),
    role: "admin",
  });
}
