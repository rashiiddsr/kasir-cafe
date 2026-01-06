/*
  POS System Database Schema (Local PostgreSQL)
  Jalankan file ini untuk membuat tabel dan data awal.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL DEFAULT 0,
  cost numeric(10, 2) NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  min_stock integer NOT NULL DEFAULT 5,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  barcode text,
  image_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number text UNIQUE NOT NULL,
  total_amount numeric(10, 2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  payment_amount numeric(10, 2) NOT NULL DEFAULT 0,
  change_amount numeric(10, 2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10, 2) NOT NULL DEFAULT 0,
  subtotal numeric(10, 2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product ON transaction_items(product_id);

INSERT INTO categories (name, description) VALUES
  ('Makanan', 'Produk makanan dan snack'),
  ('Minuman', 'Minuman dingin dan panas'),
  ('Elektronik', 'Produk elektronik'),
  ('Alat Tulis', 'Perlengkapan alat tulis')
ON CONFLICT DO NOTHING;

INSERT INTO products (name, description, price, cost, stock, min_stock, category_id, barcode, is_active)
SELECT
  'Indomie Goreng', 'Mie instan rasa goreng', 3500, 2500, 100, 20,
  (SELECT id FROM categories WHERE name = 'Makanan' LIMIT 1),
  '8992388105006', true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Indomie Goreng');

INSERT INTO products (name, description, price, cost, stock, min_stock, category_id, barcode, is_active)
SELECT
  'Aqua 600ml', 'Air mineral dalam kemasan 600ml', 3000, 2000, 150, 30,
  (SELECT id FROM categories WHERE name = 'Minuman' LIMIT 1),
  '8991234567890', true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Aqua 600ml');

INSERT INTO products (name, description, price, cost, stock, min_stock, category_id, barcode, is_active)
SELECT
  'Pulpen Hitam', 'Pulpen warna hitam', 2000, 1000, 50, 10,
  (SELECT id FROM categories WHERE name = 'Alat Tulis' LIMIT 1),
  '1234567890123', true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Pulpen Hitam');

INSERT INTO products (name, description, price, cost, stock, min_stock, category_id, barcode, is_active)
SELECT
  'Teh Botol Sosro', 'Teh dalam kemasan botol 350ml', 4000, 3000, 80, 20,
  (SELECT id FROM categories WHERE name = 'Minuman' LIMIT 1),
  '8993675010015', true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Teh Botol Sosro');

INSERT INTO products (name, description, price, cost, stock, min_stock, category_id, barcode, is_active)
SELECT
  'Chitato Rasa Sapi Panggang', 'Keripik kentang rasa sapi panggang', 10000, 7500, 40, 10,
  (SELECT id FROM categories WHERE name = 'Makanan' LIMIT 1),
  '8992775001011', true
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Chitato Rasa Sapi Panggang');
