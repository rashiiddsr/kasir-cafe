const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
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
app.use(express.json({ limit: '50mb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const SALT_ROUNDS = 10;

const serializeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username,
  role: user.role,
  phone: user.phone,
  profile: user.profile,
  is_active: Boolean(user.is_active),
  created_at: user.created_at,
  updated_at: user.updated_at,
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/categories', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM categories ORDER BY name ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Gagal mengambil data kategori' });
  }
});

app.post('/categories', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      res.status(400).json({ message: 'Nama kategori wajib diisi' });
      return;
    }

    const [result] = await pool.execute(
      `INSERT INTO categories (name, description)
       VALUES (?, ?)`,
      [name, description ?? null]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM categories WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Gagal menambahkan kategori' });
  }
});

app.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    await pool.execute(
      `UPDATE categories
       SET name = ?,
           description = ?
       WHERE id = ?`,
      [name, description, id]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM categories WHERE id = ?',
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ message: 'Gagal mengupdate kategori' });
  }
});

app.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [usageRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM products WHERE category_id = ?',
      [id]
    );

    const total = Number(usageRows[0]?.total || 0);

    if (total > 0) {
      res.status(400).json({
        message: 'Kategori tidak bisa dihapus karena masih digunakan produk.',
      });
      return;
    }

    await pool.execute('DELETE FROM categories WHERE id = ?', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Gagal menghapus kategori' });
  }
});

app.get('/users', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, email, username, role, phone, profile, is_active, created_at, updated_at
       FROM users ORDER BY name ASC`
    );
    res.json(rows.map(serializeUser));
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Gagal mengambil data user' });
  }
});

app.post('/users', async (req, res) => {
  try {
    const { name, email, username, role, phone, profile, is_active, password } =
      req.body;

    if (!name || !email || !username || !password) {
      res
        .status(400)
        .json({ message: 'Nama, email, username, dan password wajib diisi' });
      return;
    }

    const roleValue = role || 'staf';
    const isActiveValue = typeof is_active === 'undefined' ? 1 : is_active;
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await pool.execute(
      `INSERT INTO users (name, email, username, role, phone, profile, password_hash, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        username,
        roleValue,
        phone ?? null,
        profile ?? null,
        passwordHash,
        isActiveValue,
      ]
    );

    const [rows] = await pool.execute(
      `SELECT id, name, email, username, role, phone, profile, is_active, created_at, updated_at
       FROM users WHERE username = ?`,
      [username]
    );
    res.status(201).json(serializeUser(rows[0]));
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Gagal menambahkan user' });
  }
});

app.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      username,
      role,
      phone,
      profile,
      is_active,
      password,
    } = req.body;

    if (!name || !email || !username) {
      res.status(400).json({ message: 'Nama, email, dan username wajib diisi' });
      return;
    }

    const fields = [
      'name = ?',
      'email = ?',
      'username = ?',
      'role = ?',
      'phone = ?',
      'profile = ?',
    ];
    const values = [
      name,
      email,
      username,
      role || 'staf',
      phone ?? null,
      profile ?? null,
    ];

    if (typeof is_active !== 'undefined') {
      fields.push('is_active = ?');
      values.push(is_active);
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      fields.push('password_hash = ?');
      values.push(passwordHash);
    }

    values.push(id);

    await pool.execute(
      `UPDATE users
       SET ${fields.join(', ')}
       WHERE id = ?`,
      values
    );

    const [rows] = await pool.execute(
      `SELECT id, name, email, username, role, phone, profile, is_active, created_at, updated_at
       FROM users WHERE id = ?`,
      [id]
    );
    res.json(serializeUser(rows[0]));
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Gagal mengupdate user' });
  }
});

app.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT id, name, email, username, role, phone, profile, is_active, created_at, updated_at
       FROM users WHERE id = ?`,
      [id]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: 'User tidak ditemukan' });
      return;
    }
    res.json(serializeUser(rows[0]));
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Gagal mengambil data user' });
  }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Gagal menghapus user' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ message: 'Username dan password wajib diisi' });
      return;
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [
      username,
    ]);

    if (rows.length === 0) {
      res.status(401).json({ message: 'Username atau password salah' });
      return;
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      res.status(401).json({ message: 'Username atau password salah' });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ message: 'Akun anda tidak aktif' });
      return;
    }

    res.json(serializeUser(user));
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Gagal login' });
  }
});

app.get('/products', async (req, res) => {
  try {
    const values = [];
    let query = 'SELECT * FROM products';

    if (req.query.active === 'true') {
      values.push(true);
      query += ' WHERE is_active = ?';
    }

    query += ' ORDER BY name ASC';

    const [rows] = await pool.execute(query, values);
    res.json(rows);
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
      category_id,
      image_url,
      is_active,
    } = req.body;

    if (!name) {
      res.status(400).json({ message: 'Nama produk wajib diisi' });
      return;
    }

    const priceValue = price ?? 0;
    const costValue = cost ?? 0;
    const categoryValue = category_id ?? null;
    const descriptionValue = description ?? null;
    const imageUrlValue = image_url ?? null;
    const isActiveValue =
      typeof is_active === 'undefined' ? 1 : is_active;

    const [result] = await pool.execute(
      `INSERT INTO products
        (name, description, price, cost, category_id, image_url, is_active)
       VALUES (?,?,?,?,?,?,?)`,
      [
        name,
        descriptionValue,
        priceValue,
        costValue,
        categoryValue,
        imageUrlValue,
        isActiveValue,
      ]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
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
      category_id,
      image_url,
      is_active,
    } = req.body;

    if (!name) {
      res.status(400).json({ message: 'Nama produk wajib diisi' });
      return;
    }

    const priceValue = price ?? 0;
    const costValue = cost ?? 0;
    const categoryValue = category_id ?? null;
    const descriptionValue = description ?? null;
    const imageUrlValue = image_url ?? null;
    const isActiveValue =
      typeof is_active === 'undefined' ? 1 : is_active;

    await pool.execute(
      `UPDATE products
       SET name = ?,
           description = ?,
           price = ?,
           cost = ?,
           category_id = ?,
           image_url = ?,
           is_active = ?
       WHERE id = ?`,
      [
        name,
        descriptionValue,
        priceValue,
        costValue,
        categoryValue,
        imageUrlValue,
        isActiveValue,
        id,
      ]
    );

    const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [
      id,
    ]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Gagal mengupdate produk' });
  }
});

app.get('/transactions', async (req, res) => {
  try {
    const values = [];
    const conditions = [];
    let query =
      'SELECT transactions.*, users.name AS user_name FROM transactions LEFT JOIN users ON transactions.user_id = users.id';

    if (req.query.from) {
      values.push(req.query.from);
      conditions.push('transactions.created_at >= ?');
    }

    if (req.query.to) {
      values.push(req.query.to);
      conditions.push('transactions.created_at <= ?');
    }

    if (req.query.user_id) {
      values.push(req.query.user_id);
      conditions.push('transactions.user_id = ?');
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(query, values);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Gagal mengambil data transaksi' });
  }
});

app.post('/transactions', async (req, res) => {
  try {
    const {
      user_id,
      transaction_number,
      total_amount,
      payment_method,
      payment_amount,
      change_amount,
      notes,
    } = req.body;

    if (!user_id) {
      res.status(400).json({ message: 'User transaksi wajib diisi' });
      return;
    }

    const changeAmountValue =
      typeof change_amount === 'number' ? change_amount : 0;

    const [result] = await pool.execute(
      `INSERT INTO transactions
        (user_id, transaction_number, total_amount, payment_method, payment_amount, change_amount, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [
        user_id,
        transaction_number,
        total_amount,
        payment_method,
        payment_amount,
        changeAmountValue,
        notes || null,
      ]
    );

    const [rows] = await pool.execute(
      `SELECT transactions.*, users.name AS user_name
       FROM transactions
       LEFT JOIN users ON transactions.user_id = users.id
       WHERE transactions.id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
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
      query += ' WHERE transaction_items.created_at >= ?';
    }

    query += ' ORDER BY transaction_items.created_at DESC';

    const [rows] = await pool.execute(query, values);
    const formatted = rows.map((row) => ({
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

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const values = [];
    const placeholders = items.map((item, index) => {
      values.push(
        item.transaction_id,
        item.product_id,
        item.product_name,
        item.quantity,
        item.unit_price,
        item.subtotal
      );
      return '(?,?,?,?,?,?)';
    });

    await connection.execute(
      `INSERT INTO transaction_items
        (transaction_id, product_id, product_name, quantity, unit_price, subtotal)
       VALUES ${placeholders.join(',')}`,
      values
    );

    await connection.commit();
    res.status(201).json({ message: 'Item transaksi berhasil disimpan' });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating transaction items:', error);
    res.status(500).json({ message: 'Gagal menyimpan item transaksi' });
  } finally {
    connection.release();
  }
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
