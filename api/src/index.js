const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
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
const ATTENDANCE_QR_CODE =
  process.env.ATTENDANCE_QR_CODE || 'MERINDU-CAFE-ABSEN';
const ATTENDANCE_LOCATION = {
  latitude: 0.43301096585461707,
  longitude: 101.46275491224952,
};
const ATTENDANCE_MAX_RADIUS_METERS = 1000;
const ATTENDANCE_ACCURACY_BUFFER_METERS = 50;
const SHIFT_WINDOWS = [
  { label: 'Pagi', startMinutes: 8 * 60, endMinutes: 8 * 60 + 30 },
  { label: 'Sore', startMinutes: 15 * 60 + 45, endMinutes: 16 * 60 + 15 },
];

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

const serializeSavedCart = (cart) => ({
  id: cart.id,
  user_id: cart.user_id,
  name: cart.name,
  items:
    cart.items && typeof cart.items === 'string'
      ? JSON.parse(cart.items)
      : cart.items || [],
  total: Number(cart.total || 0),
  created_at: cart.created_at,
});

const normalizeCurrency = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const getDistanceMeters = (origin, target) => {
  const earthRadius = 6371000;
  const deltaLat = toRadians(target.latitude - origin.latitude);
  const deltaLng = toRadians(target.longitude - origin.longitude);
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(target.latitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

const getShiftWindow = (date) => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return SHIFT_WINDOWS.find(
    (window) =>
      minutes >= window.startMinutes && minutes <= window.endMinutes
  );
};

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

    const categoryId = randomUUID();
    await pool.execute(
      `INSERT INTO categories (id, name, description)
       VALUES (?, ?, ?)`,
      [categoryId, name, description ?? null]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM categories WHERE id = ?',
      [categoryId]
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

app.get('/attendance', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      res.status(400).json({ message: 'Tanggal absensi wajib diisi' });
      return;
    }

    const [rows] = await pool.execute(
      `SELECT attendance.id,
              attendance.user_id,
              attendance.scanned_at,
              attendance.latitude,
              attendance.longitude,
              attendance.status,
              users.name AS user_name,
              users.username AS user_username,
              users.role AS user_role
       FROM attendance
       JOIN users ON attendance.user_id = users.id
       WHERE DATE(attendance.scanned_at) = ?
       ORDER BY attendance.scanned_at ASC`,
      [date]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ message: 'Gagal mengambil data absensi' });
  }
});

app.post('/attendance/scan', async (req, res) => {
  try {
    const { user_id, qr_code, latitude, longitude, accuracy } = req.body;

    if (!user_id || !qr_code) {
      res.status(400).json({ message: 'User dan QR wajib diisi' });
      return;
    }

    if (qr_code !== ATTENDANCE_QR_CODE) {
      res.status(400).json({ message: 'QR tidak sesuai' });
      return;
    }

    const parsedLat = Number(latitude);
    const parsedLng = Number(longitude);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      res.status(400).json({ message: 'Lokasi tidak valid' });
      return;
    }

    const [userRows] = await pool.execute(
      'SELECT id, role, is_active FROM users WHERE id = ?',
      [user_id]
    );
    if (userRows.length === 0) {
      res.status(404).json({ message: 'User tidak ditemukan' });
      return;
    }

    const user = userRows[0];
    if (!user.is_active) {
      res.status(403).json({ message: 'Akun anda tidak aktif' });
      return;
    }

    if (!['admin', 'staf'].includes(user.role)) {
      res.status(403).json({ message: 'Role tidak diizinkan' });
      return;
    }

    const now = new Date();
    const shiftWindow = getShiftWindow(now);

    const distance = getDistanceMeters(ATTENDANCE_LOCATION, {
      latitude: parsedLat,
      longitude: parsedLng,
    });
    const parsedAccuracy = Number(accuracy);
    const accuracyBuffer = Number.isFinite(parsedAccuracy)
      ? Math.min(Math.max(parsedAccuracy, 0), ATTENDANCE_ACCURACY_BUFFER_METERS)
      : 0;
    const effectiveDistance = Math.max(0, distance - accuracyBuffer);
    if (effectiveDistance > ATTENDANCE_MAX_RADIUS_METERS) {
      res.status(400).json({ message: 'Lokasi anda di luar radius absensi.' });
      return;
    }

    const [existingRows] = await pool.execute(
      'SELECT id FROM attendance WHERE user_id = ? AND DATE(scanned_at) = CURDATE()',
      [user_id]
    );
    if (existingRows.length > 0) {
      res.status(409).json({ message: 'Anda sudah absen hari ini.' });
      return;
    }

    const attendanceId = randomUUID();
    await pool.execute(
      `INSERT INTO attendance (id, user_id, scanned_at, latitude, longitude, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        attendanceId,
        user_id,
        now,
        parsedLat,
        parsedLng,
        shiftWindow ? 'hadir' : 'terlambat',
      ]
    );

    const [rows] = await pool.execute(
      `SELECT attendance.id,
              attendance.user_id,
              attendance.scanned_at,
              attendance.latitude,
              attendance.longitude,
              attendance.status,
              users.name AS user_name,
              users.username AS user_username,
              users.role AS user_role
       FROM attendance
       JOIN users ON attendance.user_id = users.id
       WHERE attendance.id = ?`,
      [attendanceId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error scanning attendance:', error);
    res.status(500).json({ message: 'Gagal menyimpan absensi' });
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

app.get('/saved-carts', async (req, res) => {
  try {
    const { user_id, user_username } = req.query;

    if (!user_id && !user_username) {
      res.status(400).json({ message: 'User id wajib diisi' });
      return;
    }

    let resolvedUserId = user_id;
    if (!resolvedUserId && user_username) {
      const [userRows] = await pool.execute(
        'SELECT id FROM users WHERE username = ?',
        [user_username]
      );
      resolvedUserId = userRows[0]?.id || null;
    }
    if (!resolvedUserId) {
      res.json([]);
      return;
    }

    const [rows] = await pool.execute(
      'SELECT * FROM saved_carts WHERE user_id = ? ORDER BY created_at DESC',
      [resolvedUserId]
    );

    res.json(rows.map(serializeSavedCart));
  } catch (error) {
    console.error('Error fetching saved carts:', error);
    res.status(500).json({ message: 'Gagal mengambil pesanan tersimpan' });
  }
});

app.post('/saved-carts', async (req, res) => {
  try {
    const { user_id, user_username, name, items, total } = req.body;

    if ((!user_id && !user_username) || !name) {
      res.status(400).json({ message: 'User dan nama wajib diisi' });
      return;
    }

    if (!Array.isArray(items)) {
      res.status(400).json({ message: 'Item pesanan tidak valid' });
      return;
    }

    let resolvedUserId = user_id;
    if (resolvedUserId) {
      const [userRows] = await pool.execute(
        'SELECT id FROM users WHERE id = ?',
        [resolvedUserId]
      );
      if (!userRows.length) {
        resolvedUserId = null;
      }
    }

    if (!resolvedUserId && user_username) {
      const [userRows] = await pool.execute(
        'SELECT id FROM users WHERE username = ?',
        [user_username]
      );
      resolvedUserId = userRows[0]?.id || null;
    }

    if (!resolvedUserId) {
      res.status(400).json({ message: 'User tidak ditemukan' });
      return;
    }

    const cartId = randomUUID();
    await pool.execute(
      `INSERT INTO saved_carts (id, user_id, name, items, total)
       VALUES (?, ?, ?, ?, ?)`,
      [
        cartId,
        resolvedUserId,
        name,
        JSON.stringify(items),
        normalizeCurrency(total ?? 0),
      ]
    );

    const [rows] = await pool.execute(
      'SELECT * FROM saved_carts WHERE id = ?',
      [cartId]
    );

    res.status(201).json(serializeSavedCart(rows[0]));
  } catch (error) {
    console.error('Error creating saved cart:', error);
    res.status(500).json({ message: 'Gagal menyimpan pesanan' });
  }
});

app.delete('/saved-carts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute('DELETE FROM saved_carts WHERE id = ?', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting saved cart:', error);
    res.status(500).json({ message: 'Gagal menghapus pesanan tersimpan' });
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

app.get('/product-options', async (req, res) => {
  try {
    const values = [];
    const conditions = [];

    if (req.query.product_id) {
      values.push(req.query.product_id);
      conditions.push('product_id = ?');
    }

    const variantQuery = `SELECT * FROM product_variants${
      conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    } ORDER BY name ASC`;
    const extraQuery = `SELECT * FROM product_extras${
      conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
    } ORDER BY name ASC`;

    const [variants, extras] = await Promise.all([
      pool.execute(variantQuery, values),
      pool.execute(extraQuery, values),
    ]);

    res.json({ variants: variants[0], extras: extras[0] });
  } catch (error) {
    console.error('Error fetching product options:', error);
    res.status(500).json({ message: 'Gagal mengambil data opsi produk' });
  }
});

app.get('/products/:id/options', async (req, res) => {
  try {
    const { id } = req.params;
    const [variants] = await pool.execute(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY name ASC',
      [id]
    );
    const [extras] = await pool.execute(
      'SELECT * FROM product_extras WHERE product_id = ? ORDER BY name ASC',
      [id]
    );
    res.json({ variants, extras });
  } catch (error) {
    console.error('Error fetching product options by id:', error);
    res.status(500).json({ message: 'Gagal mengambil opsi produk' });
  }
});

app.put('/products/:id/options', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { variants = [], extras = [] } = req.body;

    await connection.beginTransaction();
    await connection.execute('DELETE FROM product_variants WHERE product_id = ?', [
      id,
    ]);
    await connection.execute('DELETE FROM product_extras WHERE product_id = ?', [
      id,
    ]);

    if (Array.isArray(variants) && variants.length > 0) {
      const variantValues = [];
      const variantPlaceholders = variants.map((variant) => {
        variantValues.push(id, variant.name);
        return '(?, ?)';
      });
      await connection.execute(
        `INSERT INTO product_variants (product_id, name) VALUES ${variantPlaceholders.join(',')}`,
        variantValues
      );
    }

    if (Array.isArray(extras) && extras.length > 0) {
      const extraValues = [];
      const extraPlaceholders = extras.map((extra) => {
        extraValues.push(
          id,
          extra.name,
          normalizeCurrency(extra.cost ?? 0),
          normalizeCurrency(extra.price ?? 0)
        );
        return '(?, ?, ?, ?)';
      });
      await connection.execute(
        `INSERT INTO product_extras (product_id, name, cost, price) VALUES ${extraPlaceholders.join(',')}`,
        extraValues
      );
    }

    await connection.commit();
    res.json({ message: 'Opsi produk berhasil disimpan' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating product options:', error);
    res.status(500).json({ message: 'Gagal menyimpan opsi produk' });
  } finally {
    connection.release();
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

    const priceValue = normalizeCurrency(price ?? 0);
    const costValue = normalizeCurrency(cost ?? 0);
    const categoryValue = category_id ?? null;
    const descriptionValue = description ?? null;
    const imageUrlValue = image_url ?? null;
    const isActiveValue =
      typeof is_active === 'undefined' ? 1 : is_active;

    const productId = randomUUID();
    await pool.execute(
      `INSERT INTO products
        (id, name, description, price, cost, category_id, image_url, is_active)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        productId,
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
      [productId]
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

    const priceValue = normalizeCurrency(price ?? 0);
    const costValue = normalizeCurrency(cost ?? 0);
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
      'SELECT transactions.*, ' +
      "COALESCE(transactions.status, 'selesai') AS status, " +
      'users.name AS user_name, voided_user.name AS voided_by_name ' +
      'FROM transactions ' +
      'LEFT JOIN users ON transactions.user_id = users.id ' +
      'LEFT JOIN users AS voided_user ON transactions.voided_by = voided_user.id';

    if (req.query.from) {
      values.push(req.query.from);
      conditions.push('transactions.created_at >= ?');
    }

    if (req.query.to) {
      values.push(req.query.to);
      conditions.push('transactions.created_at <= ?');
    }

    if (req.query.user_id && req.query.user_username) {
      values.push(req.query.user_id, req.query.user_username);
      conditions.push('(transactions.user_id = ? OR users.username = ?)');
    } else if (req.query.user_id) {
      values.push(req.query.user_id);
      conditions.push('transactions.user_id = ?');
    } else if (req.query.user_username) {
      values.push(req.query.user_username);
      conditions.push('users.username = ?');
    }

    if (req.query.search) {
      const searchValue = `%${req.query.search}%`;
      values.push(searchValue, searchValue, searchValue, searchValue);
      conditions.push(
        '(transactions.transaction_number LIKE ? OR users.name LIKE ? OR transactions.payment_method LIKE ? OR transactions.notes LIKE ?)'
      );
    }

    if (req.query.status) {
      values.push(req.query.status);
      conditions.push('transactions.status = ?');
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

app.put('/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, payment_amount, change_amount, notes } = req.body;

    const [transactionRows] = await pool.execute(
      'SELECT status FROM transactions WHERE id = ?',
      [id]
    );
    const currentStatus = transactionRows[0]?.status ?? 'selesai';
    if (currentStatus === 'gagal') {
      res.status(400).json({ message: 'Transaksi sudah di-void.' });
      return;
    }

    const paymentAmountValue = normalizeCurrency(payment_amount ?? 0);
    const changeAmountValue = normalizeCurrency(change_amount ?? 0);

    await pool.execute(
      `UPDATE transactions
       SET payment_method = ?,
           payment_amount = ?,
           change_amount = ?,
           notes = ?
       WHERE id = ?`,
      [
        payment_method,
        paymentAmountValue,
        changeAmountValue,
        notes ?? null,
        id,
      ]
    );

    const [rows] = await pool.execute(
      `SELECT transactions.*, COALESCE(transactions.status, 'selesai') AS status,
              users.name AS user_name, voided_user.name AS voided_by_name
       FROM transactions
       LEFT JOIN users ON transactions.user_id = users.id
       LEFT JOIN users AS voided_user ON transactions.voided_by = voided_user.id
       WHERE transactions.id = ?`,
      [id]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ message: 'Gagal mengupdate transaksi' });
  }
});

app.post('/transactions', async (req, res) => {
  try {
    const {
      user_id,
      user_username,
      transaction_number,
      total_amount,
      payment_method,
      payment_amount,
      change_amount,
      notes,
    } = req.body;

    let resolvedUserId = user_id;

    if (resolvedUserId) {
      const [userRows] = await pool.execute(
        'SELECT id FROM users WHERE id = ?',
        [resolvedUserId]
      );
      if (!userRows.length) {
        resolvedUserId = null;
      }
    }

    if (!resolvedUserId && user_username) {
      const [userRows] = await pool.execute(
        'SELECT id FROM users WHERE username = ?',
        [user_username]
      );
      resolvedUserId = userRows[0]?.id || null;
    }

    if (!resolvedUserId) {
      res.status(400).json({
        message:
          'User transaksi tidak ditemukan. Silakan login ulang untuk melanjutkan.',
      });
      return;
    }

    const changeAmountValue =
      typeof change_amount === 'number' ? change_amount : 0;
    const totalAmountValue = normalizeCurrency(total_amount ?? 0);
    const paymentAmountValue = normalizeCurrency(payment_amount ?? 0);
    const normalizedChangeAmount = normalizeCurrency(changeAmountValue);

    const [result] = await pool.execute(
      `INSERT INTO transactions
        (user_id, transaction_number, total_amount, payment_method, payment_amount, change_amount, status, notes)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        resolvedUserId,
        transaction_number,
        totalAmountValue,
        payment_method,
        paymentAmountValue,
        normalizedChangeAmount,
        'selesai',
        notes || null,
      ]
    );

    const [rows] = await pool.execute(
      `SELECT transactions.*, COALESCE(transactions.status, 'selesai') AS status,
              users.name AS user_name, voided_user.name AS voided_by_name
       FROM transactions
       LEFT JOIN users ON transactions.user_id = users.id
       LEFT JOIN users AS voided_user ON transactions.voided_by = voided_user.id
       WHERE transactions.transaction_number = ?`,
      [transaction_number]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ message: 'Gagal membuat transaksi' });
  }
});

app.put('/transactions/:id/void', async (req, res) => {
  try {
    const { id } = req.params;
    const { voided_by, voided_by_username } = req.body;

    if (!voided_by && !voided_by_username) {
      res.status(400).json({ message: 'User void wajib diisi.' });
      return;
    }

    let resolvedVoidUserId = voided_by;
    if (resolvedVoidUserId) {
      const [userRows] = await pool.execute(
        'SELECT id FROM users WHERE id = ?',
        [resolvedVoidUserId]
      );
      if (!userRows.length) {
        resolvedVoidUserId = null;
      }
    }

    if (!resolvedVoidUserId && voided_by_username) {
      const [userRows] = await pool.execute(
        'SELECT id FROM users WHERE username = ?',
        [voided_by_username]
      );
      resolvedVoidUserId = userRows[0]?.id || null;
    }

    if (!resolvedVoidUserId) {
      res.status(400).json({ message: 'User void tidak ditemukan.' });
      return;
    }

    const [transactionRows] = await pool.execute(
      'SELECT status FROM transactions WHERE id = ?',
      [id]
    );

    if (!transactionRows.length) {
      res.status(404).json({ message: 'Transaksi tidak ditemukan.' });
      return;
    }

    const currentStatus = transactionRows[0]?.status ?? 'selesai';
    if (currentStatus === 'gagal') {
      res.status(400).json({ message: 'Transaksi sudah di-void.' });
      return;
    }

    await pool.execute(
      `UPDATE transactions
       SET status = 'gagal',
           voided_by = ?,
           voided_at = ?
       WHERE id = ?`,
      [resolvedVoidUserId, new Date(), id]
    );

    const [rows] = await pool.execute(
      `SELECT transactions.*, COALESCE(transactions.status, 'selesai') AS status,
              users.name AS user_name, voided_user.name AS voided_by_name
       FROM transactions
       LEFT JOIN users ON transactions.user_id = users.id
       LEFT JOIN users AS voided_user ON transactions.voided_by = voided_user.id
       WHERE transactions.id = ?`,
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Error voiding transaction:', error);
    res.status(500).json({ message: 'Gagal melakukan void transaksi' });
  }
});

app.get('/transaction-items', async (req, res) => {
  try {
    const values = [];
    let query =
      'SELECT transaction_items.*, products.cost AS product_cost ' +
      'FROM transaction_items ' +
      'LEFT JOIN products ON transaction_items.product_id = products.id ' +
      'LEFT JOIN transactions ON transaction_items.transaction_id = transactions.id';

    if (req.query.from) {
      values.push(req.query.from);
      query += ' WHERE transaction_items.created_at >= ?';
    }

    if (req.query.transaction_id) {
      values.push(req.query.transaction_id);
      query += values.length === 1 ? ' WHERE' : ' AND';
      query += ' transaction_items.transaction_id = ?';
    }

    if (req.query.status) {
      values.push(req.query.status);
      query += values.length === 1 ? ' WHERE' : ' AND';
      query += ' transactions.status = ?';
    }

    query += ' ORDER BY transaction_items.created_at DESC';

    const [rows] = await pool.execute(query, values);
    const formatted = rows.map((row) => ({
      ...row,
      extras:
        row.extras && typeof row.extras === 'string'
          ? JSON.parse(row.extras)
          : row.extras || null,
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
        item.variant_name ?? null,
        item.extras ? JSON.stringify(item.extras) : null,
        normalizeCurrency(item.extras_total ?? 0),
        item.quantity,
        normalizeCurrency(item.unit_price ?? 0),
        normalizeCurrency(item.subtotal ?? 0)
      );
      return '(?,?,?,?,?,?,?,?,?)';
    });

    await connection.execute(
      `INSERT INTO transaction_items
        (transaction_id, product_id, product_name, variant_name, extras, extras_total, quantity, unit_price, subtotal)
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
