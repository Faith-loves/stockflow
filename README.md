# StockFlow

StockFlow is a lightweight inventory management system for small and medium businesses. It helps teams manage products, record sales, automatically deduct stock, restock inventory, and monitor daily stock balances from a simple dashboard.

## MVP Features

- Product management
  Add, edit, delete, and view products
- Sales recording
  Record a sale, validate stock, deduct inventory, and store the transaction
- Inventory management
  Restock products and keep a full stock movement history
- Dashboard
  View total products, daily and weekly sales, low stock alerts, and recent activity

## Architecture

StockFlow uses a simple three-layer architecture:

- Frontend
  React single-page app in [src/App.jsx](C:/Users/HP/Desktop/stockflow/src/App.jsx)
- Backend
  Express API in [server/index.js](C:/Users/HP/Desktop/stockflow/server/index.js)
- Database
  SQLite setup and seed logic in [server/db.js](C:/Users/HP/Desktop/stockflow/server/db.js)

This setup keeps hosting costs low, performance fast, and the codebase easy to maintain.

## Database Structure

### products

- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `name` TEXT NOT NULL
- `category` TEXT
- `price` REAL NOT NULL CHECK(price >= 0)
- `stock_quantity` INTEGER NOT NULL CHECK(stock_quantity >= 0)
- `initial_stock_quantity` INTEGER NOT NULL CHECK(initial_stock_quantity >= 0)
- `low_stock_threshold` INTEGER NOT NULL CHECK(low_stock_threshold >= 0)
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### sales

- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `product_id` INTEGER NOT NULL
- `quantity_sold` INTEGER NOT NULL CHECK(quantity_sold > 0)
- `unit_price` REAL NOT NULL CHECK(unit_price >= 0)
- `total_price` REAL NOT NULL CHECK(total_price >= 0)
- `created_at` TEXT NOT NULL

### stock_history

- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `product_id` INTEGER NOT NULL
- `change_type` TEXT NOT NULL
- `quantity` INTEGER NOT NULL
- `note` TEXT
- `created_at` TEXT NOT NULL

`change_type` supports:

- `INITIAL`
- `ADD`
- `SALE`
- `ADJUST`

## Daily Stock Balance Logic

StockFlow maintains stock with this formula:

`Current Stock = Previous Stock + Added Stock - Sold Quantity`

This is enforced by:

- increasing stock on restock
- decreasing stock on sale
- logging every movement in `stock_history`

## API Endpoints

### Health

- `GET /api/health`

### Products

- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

Example create payload:

```json
{
  "name": "Dynasteez Signature Hoodie",
  "category": "Hoodies",
  "price": 25000,
  "initialStockQuantity": 12,
  "lowStockThreshold": 4
}
```

### Sales

- `GET /api/sales`
- `POST /api/sales`

Example sale payload:

```json
{
  "productId": 1,
  "quantitySold": 2
}
```

### Inventory

- `POST /api/inventory/restock`
- `GET /api/inventory/history`

Example restock payload:

```json
{
  "productId": 1,
  "quantityAdded": 5,
  "note": "Weekend restock"
}
```

### Dashboard

- `GET /api/dashboard`

Returns:

- total products
- total units in stock
- daily sales totals
- weekly sales totals
- low stock products
- recent transactions

## UI Layout

### Dashboard

- KPI cards for total products, stock on hand, daily sales, and weekly sales
- low stock alert panel
- recent transaction feed
- product performance list

### Products

- add and edit product form
- searchable product table
- displays product ID, name, category, price, stock, created date, units sold, and status

### Sales

- product selector
- quantity sold input
- available stock preview
- sales history table

### Inventory

- product selector
- quantity added input
- optional restock note
- stock history audit trail

## Business Rules

- product name is required
- price must be non-negative
- initial stock must be a non-negative integer
- low stock threshold must be a non-negative integer
- sales are blocked when stock is insufficient
- stock cannot go negative
- every sale writes to `sales` and `stock_history`
- every restock writes to `stock_history`
- products with sales history cannot be deleted

## Running The App

Install dependencies:

```bash
cmd /c npm install
```

Run the app in development:

```bash
cmd /c npm run dev
```

Build for production:

```bash
cmd /c npm run build
```

Run production server:

```bash
cmd /c npm start
```

## Seed Data

On first run, StockFlow seeds the database with sample products so the dashboard is not empty.

Database files are stored in:

- [data/stockflow.db](C:/Users/HP/Desktop/stockflow/data/stockflow.db)

## Verification

The current implementation has been verified with:

- production build via `npm run build`
- API health check
- product listing
- sale recording with stock deduction
- restock flow with stock history logging
- dashboard aggregation
