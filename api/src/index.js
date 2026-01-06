const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT) || 4000;

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : [];

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
  })
);
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/categories', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM categories ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Gagal mengambil data kategori' });
  }
});

app.get('/products', async (req, res) => {
  try {
    const values = [];
    let query = 'SELECT * FROM products';

    if (req.query.active === 'true') {
      values.push(true);
      query += ' WHERE is_active = $1';
    }

    query += ' ORDER BY name ASC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Gagal mengambil data produk' });
  }
});

app.post('/products', async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      cost,
      stock,
      min_stock,
      category_id,
      barcode,
      image_url,
      is_active,
      updated_at,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO products
        (name, description, price, cost, stock, min_stock, category_id, barcode, image_url, is_active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        name,
        description,
        price,
        cost,
        stock,
        min_stock,
        category_id,
        barcode,
        image_url,
        is_active,
        updated_at,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ message: 'Gagal menambahkan produk' });
  }
});

app.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      cost,
      stock,
      min_stock,
      category_id,
      barcode,
      image_url,
      is_active,
      updated_at,
    } = req.body;

    const result = await pool.query(
      `UPDATE products
       SET name = $1,
           description = $2,
           price = $3,
           cost = $4,
           stock = $5,
           min_stock = $6,
           category_id = $7,
           barcode = $8,
           image_url = $9,
           is_active = $10,
           updated_at = $11
       WHERE id = $12
       RETURNING *`,
      [
        name,
        description,
        price,
        cost,
        stock,
        min_stock,
        category_id,
        barcode,
        image_url,
        is_active,
        updated_at,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Gagal mengupdate produk' });
  }
});

app.patch('/products/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { stock } = req.body;

    const result = await pool.query(
      'UPDATE products SET stock = $1 WHERE id = $2 RETURNING *',
      [stock, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ message: 'Gagal mengupdate stok' });
  }
});

app.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Gagal menghapus produk' });
  }
});

app.get('/transactions', async (req, res) => {
  try {
    const values = [];
    let query = 'SELECT * FROM transactions';

    if (req.query.from) {
      values.push(req.query.from);
      query += ' WHERE created_at >= $1';
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Gagal mengambil data transaksi' });
  }
});

app.post('/transactions', async (req, res) => {
  try {
    const {
      transaction_number,
      total_amount,
      payment_method,
      payment_amount,
      change_amount,
      notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO transactions
        (transaction_number, total_amount, payment_method, payment_amount, change_amount, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        transaction_number,
        total_amount,
        payment_method,
        payment_amount,
        change_amount,
        notes || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ message: 'Gagal membuat transaksi' });
  }
});

app.get('/transaction-items', async (req, res) => {
  try {
    const values = [];
    let query =
      'SELECT transaction_items.*, products.cost AS product_cost FROM transaction_items LEFT JOIN products ON transaction_items.product_id = products.id';

    if (req.query.from) {
      values.push(req.query.from);
      query += ' WHERE transaction_items.created_at >= $1';
    }

    query += ' ORDER BY transaction_items.created_at DESC';

    const result = await pool.query(query, values);
    const formatted = result.rows.map((row) => ({
      ...row,
      products: row.product_cost !== null ? { cost: row.product_cost } : null,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching transaction items:', error);
    res.status(500).json({ message: 'Gagal mengambil data item transaksi' });
  }
});

app.post('/transaction-items', async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ message: 'Item transaksi tidak boleh kosong' });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const values = [];
    const placeholders = items.map((item, index) => {
      const baseIndex = index * 6;
      values.push(
        item.transaction_id,
        item.product_id,
        item.product_name,
        item.quantity,
        item.unit_price,
        item.subtotal
      );
      return `($${baseIndex + 1},$${baseIndex + 2},$${baseIndex + 3},$${baseIndex + 4},$${baseIndex + 5},$${baseIndex + 6})`;
    });

    await client.query(
      `INSERT INTO transaction_items
        (transaction_id, product_id, product_name, quantity, unit_price, subtotal)
       VALUES ${placeholders.join(',')}`,
      values
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Item transaksi berhasil disimpan' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating transaction items:', error);
    res.status(500).json({ message: 'Gagal menyimpan item transaksi' });
  } finally {
    client.release();
  }
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
