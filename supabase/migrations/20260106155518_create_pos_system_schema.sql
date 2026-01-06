/*
  # POS System Database Schema

  ## Overview
  Complete database schema for a Point of Sale (POS) system with inventory management and reporting capabilities.

  ## New Tables

  ### 1. categories
  - `id` (uuid, primary key) - Unique identifier for each category
  - `name` (text) - Category name
  - `description` (text, nullable) - Category description
  - `created_at` (timestamptz) - Timestamp when category was created

  ### 2. products
  - `id` (uuid, primary key) - Unique identifier for each product
  - `name` (text) - Product name
  - `description` (text, nullable) - Product description
  - `price` (numeric) - Product selling price
  - `cost` (numeric) - Product cost/purchase price
  - `stock` (integer) - Current stock quantity
  - `min_stock` (integer) - Minimum stock threshold for alerts
  - `category_id` (uuid, foreign key) - Reference to categories table
  - `barcode` (text, nullable) - Product barcode
  - `image_url` (text, nullable) - Product image URL
  - `is_active` (boolean) - Whether product is active/available
  - `created_at` (timestamptz) - Timestamp when product was created
  - `updated_at` (timestamptz) - Timestamp when product was last updated

  ### 3. transactions
  - `id` (uuid, primary key) - Unique identifier for each transaction
  - `transaction_number` (text, unique) - Human-readable transaction number
  - `total_amount` (numeric) - Total transaction amount
  - `payment_method` (text) - Payment method (cash, card, etc.)
  - `payment_amount` (numeric) - Amount paid by customer
  - `change_amount` (numeric) - Change given to customer
  - `notes` (text, nullable) - Additional transaction notes
  - `created_at` (timestamptz) - Timestamp when transaction was created

  ### 4. transaction_items
  - `id` (uuid, primary key) - Unique identifier for each item
  - `transaction_id` (uuid, foreign key) - Reference to transactions table
  - `product_id` (uuid, foreign key) - Reference to products table
  - `product_name` (text) - Product name snapshot at time of sale
  - `quantity` (integer) - Quantity sold
  - `unit_price` (numeric) - Unit price at time of sale
  - `subtotal` (numeric) - Subtotal for this line item
  - `created_at` (timestamptz) - Timestamp when item was added

  ## Security
  - Enable RLS on all tables
  - Add policies for public access (for demo purposes, in production you'd want authentication)
*/

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Create products table
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

-- Create transactions table
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

-- Create transaction_items table
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product ON transaction_items(product_id);

-- Enable Row Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (for demo purposes)
-- In production, you would restrict these to authenticated users

CREATE POLICY "Allow public read access to categories"
  ON categories FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert to categories"
  ON categories FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update to categories"
  ON categories FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete from categories"
  ON categories FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read access to products"
  ON products FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert to products"
  ON products FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update to products"
  ON products FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete from products"
  ON products FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read access to transactions"
  ON transactions FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert to transactions"
  ON transactions FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update to transactions"
  ON transactions FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete from transactions"
  ON transactions FOR DELETE
  TO public
  USING (true);

CREATE POLICY "Allow public read access to transaction_items"
  ON transaction_items FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert to transaction_items"
  ON transaction_items FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update to transaction_items"
  ON transaction_items FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete from transaction_items"
  ON transaction_items FOR DELETE
  TO public
  USING (true);

-- Insert sample categories
INSERT INTO categories (name, description) VALUES
  ('Makanan', 'Produk makanan dan snack'),
  ('Minuman', 'Minuman dingin dan panas'),
  ('Elektronik', 'Produk elektronik'),
  ('Alat Tulis', 'Perlengkapan alat tulis')
ON CONFLICT DO NOTHING;

-- Insert sample products
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