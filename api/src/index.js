process.env.TZ = process.env.TZ || 'Asia/Jakarta';

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT) || 4000;

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : [];

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
  })
);
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+07:00',
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
  {
    label: 'Pagi',
    startMinutes: 7 * 60 + 45,
    endMinutes: 8 * 60 + 30,
    lateUntilMinutes: 9 * 60,
  },
  {
    label: 'Sore',
    startMinutes: 15 * 60 + 45,
    endMinutes: 16 * 60 + 30,
    lateUntilMinutes: 17 * 60,
  },
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

const serializeDiscount = (discount) => ({
  id: discount.id,
  name: discount.name,
  code: discount.code,
  description: discount.description,
  discount_type: discount.discount_type,
  value: Number(discount.value || 0),
  value_type: discount.value_type,
  min_purchase:
    discount.min_purchase !== null ? Number(discount.min_purchase) : null,
  max_discount:
    discount.max_discount !== null ? Number(discount.max_discount) : null,
  stock: discount.stock !== null ? Number(discount.stock) : null,
  product_id: discount.product_id,
  product_ids: (() => {
    if (discount.product_ids && typeof discount.product_ids === 'string') {
      return JSON.parse(discount.product_ids);
    }
    if (Array.isArray(discount.product_ids)) {
      return discount.product_ids;
    }
    return discount.product_id ? [discount.product_id] : [];
  })(),
  product_name: discount.product_name,
  min_quantity:
    discount.min_quantity !== null ? Number(discount.min_quantity) : null,
  is_multiple: Boolean(discount.is_multiple ?? 1),
  combo_items:
    discount.combo_items && typeof discount.combo_items === 'string'
      ? JSON.parse(discount.combo_items)
      : discount.combo_items || [],
  valid_from: discount.valid_from,
  valid_until: discount.valid_until,
  is_active: Boolean(discount.is_active),
  created_at: discount.created_at,
  updated_at: discount.updated_at,
});

const saveProfileImage = async (profile) => {
  if (!profile || typeof profile !== 'string') {
    return profile ?? null;
  }

  if (!profile.startsWith('data:image/')) {
    return profile;
  }

  const match = profile.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return profile;
  }

  const mimeType = match[1];
  const base64Data = match[2];
  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const fileName = `profile-${randomUUID()}.${extension}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  await fs.promises.writeFile(filePath, Buffer.from(base64Data, 'base64'));
  return `/uploads/${fileName}`;
};

const validateDiscountPayload = async ({
  discountType,
  valueType,
  normalizedValue,
  normalizedMaxDiscount,
  productId,
  productIds,
  normalizedMinPurchase,
  normalizedStock,
}) => {
  if (normalizedValue < 0) {
    return 'Nilai diskon tidak boleh negatif.';
  }

  if (normalizedMaxDiscount !== null && normalizedMaxDiscount < 0) {
    return 'Maksimal diskon tidak boleh negatif.';
  }

  if (normalizedStock !== null && normalizedStock < 0) {
    return 'Stok diskon tidak boleh negatif.';
  }

  if (valueType === 'percent' && normalizedValue > 100) {
    return 'Persentase diskon tidak boleh lebih dari 100%.';
  }

  if (discountType === 'product') {
    const ids = Array.isArray(productIds)
      ? productIds.filter(Boolean)
      : productId
        ? [productId]
        : [];
    if (ids.length === 0) {
      return 'Produk diskon wajib diisi.';
    }

    if (valueType === 'amount') {
      const placeholders = ids.map(() => '?').join(', ');
      const [productRows] = await pool.execute(
        `SELECT id, price FROM products WHERE id IN (${placeholders})`,
        ids
      );
      if (!productRows.length || productRows.length !== ids.length) {
        return 'Produk diskon tidak ditemukan.';
      }

      const hasInvalidPrice = productRows.some(
        (row) => normalizedValue > Number(row.price || 0)
      );
      if (hasInvalidPrice) {
        return 'Diskon produk tidak boleh lebih besar dari harga produk.';
      }
    }
  }

  if (
    discountType === 'order' &&
    valueType === 'amount' &&
    normalizedMinPurchase !== null &&
    normalizedMinPurchase > 0 &&
    normalizedMinPurchase < normalizedValue
  ) {
    return 'Minimal transaksi harus lebih besar atau sama dengan nilai diskon.';
  }

  return null;
};
const normalizeCurrency = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const normalizeStock = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.floor(parsed);
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
      minutes >= window.startMinutes && minutes <= window.lateUntilMinutes
  );
};

const getAttendanceStatus = (date) => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const window = getShiftWindow(date);
  if (!window) {
    return { status: null, window: null };
  }
  const status = minutes > window.endMinutes ? 'terlambat' : 'hadir';
  return { status, window };
};

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getJakartaNow = () => new Date();

const getCashierSummary = async (startAt, endAt, userId) => {
  const [summaryRows] = await pool.execute(
    `SELECT COUNT(*) AS total_transactions,
            COALESCE(SUM(total_amount), 0) AS total_revenue,
            COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) AS total_cash,
            COALESCE(SUM(CASE WHEN payment_method = 'non-cash' THEN total_amount ELSE 0 END), 0) AS total_non_cash
     FROM transactions
     WHERE COALESCE(status, 'selesai') = 'selesai'
       AND user_id = ?
       AND created_at BETWEEN ? AND ?`,
    [userId, startAt, endAt]
  );

  const [productRows] = await pool.execute(
    `SELECT transaction_items.product_name,
            SUM(transaction_items.quantity) AS quantity
     FROM transaction_items
     JOIN transactions ON transaction_items.transaction_id = transactions.id
     WHERE COALESCE(transactions.status, 'selesai') = 'selesai'
       AND transactions.user_id = ?
       AND transactions.created_at BETWEEN ? AND ?
     GROUP BY transaction_items.product_name
     ORDER BY quantity DESC`,
    [userId, startAt, endAt]
  );

  const summary = summaryRows[0] || {};
  return {
    total_transactions: Number(summary.total_transactions || 0),
    total_revenue: Number(summary.total_revenue || 0),
    total_cash: Number(summary.total_cash || 0),
    total_non_cash: Number(summary.total_non_cash || 0),
    products: productRows.map((row) => ({
      name: row.product_name,
      quantity: Number(row.quantity || 0),
    })),
  };
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
    const profilePath = await saveProfileImage(profile ?? null);

    await pool.execute(
      `INSERT INTO users (name, email, username, role, phone, profile, password_hash, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        username,
        roleValue,
        phone ?? null,
        profilePath,
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
    ];
    const values = [
      name,
      email,
      username,
      role || 'staf',
      phone ?? null,
    ];

    if (typeof profile !== 'undefined') {
      const profilePath = await saveProfileImage(profile ?? null);
      fields.push('profile = ?');
      values.push(profilePath);
    }

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
    if (rows.length === 0) {
      res.status(404).json({ message: 'User tidak ditemukan' });
      return;
    }
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
    const { date, start_date, end_date } = req.query;
    const filterDate = date || start_date;
    if (!filterDate && !end_date) {
      res.status(400).json({ message: 'Tanggal absensi wajib diisi' });
      return;
    }

    const params = [];
    let whereClause = '';
    if (start_date && end_date) {
      whereClause = 'WHERE DATE(attendance.scanned_at) BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (filterDate) {
      whereClause = 'WHERE DATE(attendance.scanned_at) = ?';
      params.push(filterDate);
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
       ${whereClause}
       ORDER BY attendance.scanned_at ASC`,
      params
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
    const { status: attendanceStatus } = getAttendanceStatus(now);
    if (!attendanceStatus) {
      res.status(400).json({ message: 'Absen ditolak.' });
      return;
    }

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
        attendanceStatus,
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

app.post('/attendance/manual', async (req, res) => {
  try {
    const { user_id, target_user_id, scanned_at } = req.body;
    if (!user_id || !target_user_id || !scanned_at) {
      res.status(400).json({ message: 'User dan jam absensi wajib diisi.' });
      return;
    }

    const [editorRows] = await pool.execute(
      'SELECT id, role, is_active FROM users WHERE id = ?',
      [user_id]
    );
    if (editorRows.length === 0) {
      res.status(404).json({ message: 'User tidak ditemukan' });
      return;
    }
    const editor = editorRows[0];
    if (!editor.is_active) {
      res.status(403).json({ message: 'Akun anda tidak aktif' });
      return;
    }
    if (!['manager', 'superadmin'].includes(editor.role)) {
      res.status(403).json({ message: 'Role tidak diizinkan' });
      return;
    }

    const [targetRows] = await pool.execute(
      'SELECT id, role, is_active FROM users WHERE id = ?',
      [target_user_id]
    );
    if (targetRows.length === 0) {
      res.status(404).json({ message: 'User absensi tidak ditemukan.' });
      return;
    }
    const targetUser = targetRows[0];
    if (!targetUser.is_active) {
      res.status(403).json({ message: 'Akun user tidak aktif' });
      return;
    }
    if (!['admin', 'staf'].includes(targetUser.role)) {
      res.status(403).json({ message: 'Role tidak diizinkan' });
      return;
    }

    const nextScannedAt = new Date(scanned_at);
    if (Number.isNaN(nextScannedAt.getTime())) {
      res.status(400).json({ message: 'Jam absensi tidak valid.' });
      return;
    }
    const todayDate = formatLocalDate(getJakartaNow());
    const nextDate = formatLocalDate(nextScannedAt);
    if (nextDate !== todayDate) {
      res.status(400).json({ message: 'Jam absensi harus di hari ini.' });
      return;
    }

    const { status: attendanceStatus } = getAttendanceStatus(nextScannedAt);
    if (!attendanceStatus) {
      res.status(400).json({ message: 'Absen ditolak.' });
      return;
    }

    const [existingRows] = await pool.execute(
      'SELECT id FROM attendance WHERE user_id = ? AND DATE(scanned_at) = ?',
      [target_user_id, nextDate]
    );
    if (existingRows.length > 0) {
      res.status(409).json({ message: 'User sudah absen hari ini.' });
      return;
    }

    const attendanceId = randomUUID();
    await pool.execute(
      `INSERT INTO attendance (id, user_id, scanned_at, latitude, longitude, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        attendanceId,
        target_user_id,
        nextScannedAt,
        ATTENDANCE_LOCATION.latitude,
        ATTENDANCE_LOCATION.longitude,
        attendanceStatus,
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
    console.error('Error creating attendance manually:', error);
    res.status(500).json({ message: 'Gagal menyimpan absensi' });
  }
});

app.put('/attendance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, scanned_at } = req.body;
    if (!user_id || !scanned_at) {
      res.status(400).json({ message: 'User dan jam absensi wajib diisi.' });
      return;
    }

    const [editorRows] = await pool.execute(
      'SELECT id, role, is_active FROM users WHERE id = ?',
      [user_id]
    );
    if (editorRows.length === 0) {
      res.status(404).json({ message: 'User tidak ditemukan' });
      return;
    }
    const editor = editorRows[0];
    if (!editor.is_active) {
      res.status(403).json({ message: 'Akun anda tidak aktif' });
      return;
    }
    if (!['manager', 'superadmin'].includes(editor.role)) {
      res.status(403).json({ message: 'Role tidak diizinkan' });
      return;
    }

    const [attendanceRows] = await pool.execute(
      `SELECT * FROM attendance WHERE id = ?`,
      [id]
    );
    if (attendanceRows.length === 0) {
      res.status(404).json({ message: 'Data absensi tidak ditemukan.' });
      return;
    }

    const attendance = attendanceRows[0];
    const today = getJakartaNow();
    const todayDate = formatLocalDate(today);
    const attendanceDate = formatLocalDate(new Date(attendance.scanned_at));
    if (attendanceDate !== todayDate) {
      res
        .status(403)
        .json({ message: 'Absensi hanya bisa diedit di hari yang sama.' });
      return;
    }

    const nextScannedAt = new Date(scanned_at);
    if (Number.isNaN(nextScannedAt.getTime())) {
      res.status(400).json({ message: 'Jam absensi tidak valid.' });
      return;
    }
    const nextDate = formatLocalDate(nextScannedAt);
    if (nextDate !== todayDate) {
      res
        .status(400)
        .json({ message: 'Jam absensi harus di hari ini.' });
      return;
    }

    const { status: attendanceStatus } = getAttendanceStatus(nextScannedAt);
    if (!attendanceStatus) {
      res.status(400).json({ message: 'Absen ditolak.' });
      return;
    }

    await pool.execute(
      `UPDATE attendance
       SET scanned_at = ?, status = ?
       WHERE id = ?`,
      [nextScannedAt, attendanceStatus, id]
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
      [id]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ message: 'Gagal memperbarui absensi' });
  }
});

app.get('/cashier/sessions/status', async (req, res) => {
  try {
    const { date, user_id } = req.query;
    if (!user_id) {
      res.status(400).json({ message: 'User wajib diisi' });
      return;
    }
    const today =
      typeof date === 'string' && date ? new Date(`${date}T00:00:00`) : getJakartaNow();
    const todayDate = formatLocalDate(today);

    const [openRows] = await pool.execute(
      `SELECT * FROM cashier_sessions
       WHERE closed_at IS NULL
         AND opened_by = ?
       ORDER BY opened_at DESC
       LIMIT 1`,
      [user_id]
    );

    if (openRows.length > 0) {
      const openSession = openRows[0];
      const openedDate = formatLocalDate(new Date(openSession.opened_at));
      if (openedDate !== todayDate) {
        const summary = await getCashierSummary(
          openSession.opened_at,
          getJakartaNow(),
          openSession.opened_by
        );
        res.json({
          status: 'needs-close',
          session: openSession,
          summary,
        });
        return;
      }
      res.json({
        status: 'open',
        session: openSession,
      });
      return;
    }

    const [todayRows] = await pool.execute(
      `SELECT * FROM cashier_sessions
       WHERE DATE(opened_at) = ?
         AND opened_by = ?
       ORDER BY opened_at DESC
       LIMIT 1`,
      [todayDate, user_id]
    );

    if (todayRows.length > 0) {
      res.json({
        status: 'closed',
        session: todayRows[0],
      });
      return;
    }

    res.json({ status: 'needs-open' });
  } catch (error) {
    console.error('Error fetching cashier status:', error);
    res.status(500).json({ message: 'Gagal memuat status kasir' });
  }
});

app.get('/cashier/sessions', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const conditions = [];
    const params = [];

    if (start_date) {
      conditions.push('cashier_sessions.opened_at >= ?');
      params.push(`${start_date} 00:00:00`);
    }

    if (end_date) {
      conditions.push('cashier_sessions.opened_at <= ?');
      params.push(`${end_date} 23:59:59`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const [rows] = await pool.execute(
      `SELECT cashier_sessions.*,
              opened_user.name AS opened_by_name,
              opened_user.username AS opened_by_username,
              closed_user.name AS closed_by_name,
              closed_user.username AS closed_by_username
       FROM cashier_sessions
       LEFT JOIN users AS opened_user ON cashier_sessions.opened_by = opened_user.id
       LEFT JOIN users AS closed_user ON cashier_sessions.closed_by = closed_user.id
       ${whereClause}
       ORDER BY cashier_sessions.opened_at DESC`,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching cashier sessions:', error);
    res.status(500).json({ message: 'Gagal memuat histori kasir' });
  }
});

app.get('/cashier/sessions/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const [sessionRows] = await pool.execute(
      `SELECT * FROM cashier_sessions WHERE id = ?`,
      [id]
    );
    if (sessionRows.length === 0) {
      res.status(404).json({ message: 'Data kasir tidak ditemukan.' });
      return;
    }
    const session = sessionRows[0];
    const endAt = getJakartaNow();
    const summary = await getCashierSummary(session.opened_at, endAt, session.opened_by);
    res.json({
      session,
      summary,
      end_at: endAt,
    });
  } catch (error) {
    console.error('Error fetching cashier summary:', error);
    res.status(500).json({ message: 'Gagal memuat ringkasan kasir' });
  }
});

app.post('/cashier/sessions/open', async (req, res) => {
  try {
    const { user_id, opening_balance } = req.body;
    if (!user_id) {
      res.status(400).json({ message: 'User wajib diisi' });
      return;
    }
    if (opening_balance === undefined || opening_balance === null || opening_balance === '') {
      res.status(400).json({ message: 'Uang kas awal wajib diisi' });
      return;
    }

    const [openRows] = await pool.execute(
      `SELECT id FROM cashier_sessions
       WHERE closed_at IS NULL
         AND opened_by = ?
       ORDER BY opened_at DESC
       LIMIT 1`,
      [user_id]
    );
    if (openRows.length > 0) {
      res.status(409).json({ message: 'Kasir sebelumnya belum ditutup.' });
      return;
    }

    const todayDate = formatLocalDate(getJakartaNow());
    const [todayRows] = await pool.execute(
      `SELECT id FROM cashier_sessions
       WHERE DATE(opened_at) = ?
         AND opened_by = ?
       LIMIT 1`,
      [todayDate, user_id]
    );
    if (todayRows.length > 0) {
      res.status(409).json({ message: 'Kasir sudah dibuka hari ini.' });
      return;
    }

    const sessionId = randomUUID();
    const openingBalance = normalizeCurrency(opening_balance);
    await pool.execute(
      `INSERT INTO cashier_sessions (id, opened_by, opened_at, opening_balance)
       VALUES (?, ?, ?, ?)`,
      [sessionId, user_id, getJakartaNow(), openingBalance]
    );

    const [rows] = await pool.execute(
      `SELECT * FROM cashier_sessions WHERE id = ?`,
      [sessionId]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error opening cashier session:', error);
    res.status(500).json({ message: 'Gagal membuka kasir' });
  }
});

app.post('/cashier/sessions/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, closing_cash, closing_non_cash, notes } = req.body;
    if (!user_id) {
      res.status(400).json({ message: 'User wajib diisi' });
      return;
    }
    if (closing_cash === undefined || closing_cash === null || closing_cash === '') {
      res.status(400).json({ message: 'Tunai aktual wajib diisi' });
      return;
    }
    if (closing_non_cash === undefined || closing_non_cash === null || closing_non_cash === '') {
      res.status(400).json({ message: 'Non-tunai aktual wajib diisi' });
      return;
    }
    const [sessionRows] = await pool.execute(
      `SELECT * FROM cashier_sessions WHERE id = ?`,
      [id]
    );
    if (sessionRows.length === 0) {
      res.status(404).json({ message: 'Data kasir tidak ditemukan.' });
      return;
    }
    const session = sessionRows[0];
    if (session.closed_at) {
      res.status(409).json({ message: 'Kasir sudah ditutup.' });
      return;
    }
    if (session.opened_by !== user_id) {
      res.status(403).json({ message: 'Kasir hanya bisa ditutup oleh pembuka.' });
      return;
    }

    const [savedRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM saved_carts WHERE user_id = ?`,
      [user_id]
    );
    if (savedRows[0]?.total > 0) {
      res
        .status(409)
        .json({ message: 'Selesaikan semua pesanan tersimpan sebelum menutup kasir.' });
      return;
    }

    const endAt = getJakartaNow();
    const summary = await getCashierSummary(session.opened_at, endAt, session.opened_by);
    const expectedCash = normalizeCurrency(session.opening_balance) +
      normalizeCurrency(summary.total_cash);
    const expectedNonCash = normalizeCurrency(summary.total_non_cash);
    const actualCash = normalizeCurrency(closing_cash);
    const actualNonCash = normalizeCurrency(closing_non_cash);
    const varianceCash = normalizeCurrency(actualCash - expectedCash);
    const varianceNonCash = normalizeCurrency(actualNonCash - expectedNonCash);
    const varianceTotal = normalizeCurrency(
      actualCash + actualNonCash - (expectedCash + expectedNonCash)
    );

    await pool.execute(
      `UPDATE cashier_sessions
       SET closed_at = ?,
           closed_by = ?,
           closing_cash = ?,
           closing_non_cash = ?,
           closing_notes = ?,
           total_transactions = ?,
           total_revenue = ?,
           total_cash = ?,
           total_non_cash = ?,
           variance_cash = ?,
           variance_non_cash = ?,
           variance_total = ?,
           products_summary = ?
       WHERE id = ?`,
      [
        endAt,
        user_id ?? null,
        actualCash,
        actualNonCash,
        notes ?? null,
        summary.total_transactions,
        summary.total_revenue,
        summary.total_cash,
        summary.total_non_cash,
        varianceCash,
        varianceNonCash,
        varianceTotal,
        JSON.stringify(summary.products || []),
        id,
      ]
    );

    const [rows] = await pool.execute(
      `SELECT * FROM cashier_sessions WHERE id = ?`,
      [id]
    );
    res.json({
      session: rows[0],
      summary,
      variance: {
        cash: varianceCash,
        non_cash: varianceNonCash,
        total: varianceTotal,
      },
    });
  } catch (error) {
    console.error('Error closing cashier session:', error);
    res.status(500).json({ message: 'Gagal menutup kasir' });
  }
});

app.put('/cashier/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { opening_balance, closing_cash, closing_non_cash } = req.body;

    if (opening_balance === undefined || opening_balance === null || opening_balance === '') {
      res.status(400).json({ message: 'Kas awal wajib diisi' });
      return;
    }
    if (closing_cash === undefined || closing_cash === null || closing_cash === '') {
      res.status(400).json({ message: 'Tunai aktual wajib diisi' });
      return;
    }
    if (closing_non_cash === undefined || closing_non_cash === null || closing_non_cash === '') {
      res.status(400).json({ message: 'Non-tunai aktual wajib diisi' });
      return;
    }

    const [sessionRows] = await pool.execute(
      `SELECT * FROM cashier_sessions WHERE id = ?`,
      [id]
    );
    if (sessionRows.length === 0) {
      res.status(404).json({ message: 'Data kasir tidak ditemukan.' });
      return;
    }
    const session = sessionRows[0];
    if (!session.closed_at) {
      res.status(409).json({ message: 'Kasir belum ditutup.' });
      return;
    }

    const openingBalance = normalizeCurrency(opening_balance);
    const actualCash = normalizeCurrency(closing_cash);
    const actualNonCash = normalizeCurrency(closing_non_cash);
    const expectedCash = normalizeCurrency(openingBalance) +
      normalizeCurrency(session.total_cash);
    const expectedNonCash = normalizeCurrency(session.total_non_cash);
    const varianceCash = normalizeCurrency(actualCash - expectedCash);
    const varianceNonCash = normalizeCurrency(actualNonCash - expectedNonCash);
    const varianceTotal = normalizeCurrency(
      actualCash + actualNonCash - (expectedCash + expectedNonCash)
    );

    await pool.execute(
      `UPDATE cashier_sessions
       SET opening_balance = ?,
           closing_cash = ?,
           closing_non_cash = ?,
           variance_cash = ?,
           variance_non_cash = ?,
           variance_total = ?
       WHERE id = ?`,
      [
        openingBalance,
        actualCash,
        actualNonCash,
        varianceCash,
        varianceNonCash,
        varianceTotal,
        id,
      ]
    );

    const [rows] = await pool.execute(
      `SELECT * FROM cashier_sessions WHERE id = ?`,
      [id]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating cashier session:', error);
    res.status(500).json({ message: 'Gagal memperbarui histori kasir' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, identifier, password } = req.body;
    const rawIdentifier =
      typeof identifier === 'string' && identifier.trim()
        ? identifier
        : username;

    if (!rawIdentifier || !password) {
      res
        .status(400)
        .json({ message: 'Email, no HP, atau username dan password wajib diisi' });
      return;
    }

    const trimmedIdentifier = rawIdentifier.trim();
    const normalizedEmail = trimmedIdentifier.toLowerCase();
    const normalizedPhone = trimmedIdentifier.replace(/[^\d]/g, '');
    const phoneCandidates = new Set();
    if (normalizedPhone) {
      phoneCandidates.add(normalizedPhone);
      if (normalizedPhone.startsWith('0')) {
        phoneCandidates.add(`62${normalizedPhone.slice(1)}`);
      }
      if (normalizedPhone.startsWith('62')) {
        phoneCandidates.add(`0${normalizedPhone.slice(2)}`);
      }
    }
    const normalizedPhones = Array.from(phoneCandidates);
    const phoneFallbacks =
      normalizedPhones.length > 0 ? normalizedPhones : ['__no_phone__'];
    const [rows] = await pool.execute(
      `SELECT * FROM users
       WHERE username = ?
          OR LOWER(email) = ?
          OR phone = ?
          OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') IN (${phoneFallbacks
            .map(() => '?')
            .join(', ')})`,
      [
        trimmedIdentifier,
        normalizedEmail,
        trimmedIdentifier,
        ...phoneFallbacks,
      ]
    );

    if (rows.length === 0) {
      res
        .status(401)
        .json({ message: 'Email, no HP, atau username/password salah' });
      return;
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      res
        .status(401)
        .json({ message: 'Email, no HP, atau username/password salah' });
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

    await pool.execute(
      'DELETE FROM saved_carts WHERE user_id = ? AND created_at < CURDATE()',
      [resolvedUserId]
    );

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

app.get('/discounts', async (req, res) => {
  try {
    const values = [];
    const conditions = [];
    let query =
      'SELECT discounts.*, products.name AS product_name ' +
      'FROM discounts ' +
      'LEFT JOIN products ON discounts.product_id = products.id';

    if (req.query.active) {
      values.push(1);
      conditions.push('discounts.is_active = ?');
    }

    if (req.query.type) {
      values.push(req.query.type);
      conditions.push('discounts.discount_type = ?');
    }

    if (req.query.search) {
      const searchValue = `%${req.query.search}%`;
      values.push(searchValue, searchValue);
      conditions.push('(discounts.name LIKE ? OR discounts.code LIKE ?)');
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY discounts.created_at DESC';

    const [rows] = await pool.execute(query, values);
    res.json(rows.map(serializeDiscount));
  } catch (error) {
    console.error('Error fetching discounts:', error);
    res.status(500).json({ message: 'Gagal mengambil data diskon' });
  }
});

app.post('/discounts', async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      discount_type,
      value,
      value_type,
      min_purchase,
      max_discount,
      stock,
      product_id,
      product_ids,
      min_quantity,
      is_multiple,
      combo_items,
      valid_from,
      valid_until,
      is_active,
    } = req.body;

    if (!name || !code) {
      res.status(400).json({ message: 'Nama dan kode diskon wajib diisi' });
      return;
    }

    const discountTypeValue = discount_type || 'order';
    const valueTypeValue = value_type || 'amount';
    const discountId = randomUUID();
    const normalizedValue = normalizeCurrency(value ?? 0);
    let normalizedMaxDiscount =
      max_discount !== undefined && max_discount !== null
        ? normalizeCurrency(max_discount)
        : null;
    let normalizedMinPurchase =
      min_purchase !== undefined && min_purchase !== null
        ? normalizeCurrency(min_purchase)
        : null;
    const normalizedStock = normalizeStock(stock);
    const normalizedMinQuantity =
      min_quantity !== undefined && min_quantity !== null
        ? Number(min_quantity)
        : 1;
    const productIds = Array.isArray(product_ids)
      ? product_ids.filter(Boolean)
      : product_id
        ? [product_id]
        : [];
    const productIdValue = productIds[0] ?? null;
    const productIdsPayload = productIds.length > 0 ? JSON.stringify(productIds) : null;
    const multipleValue =
      typeof is_multiple === 'undefined' ? 1 : is_multiple ? 1 : 0;
    const activeValue = typeof is_active === 'undefined' ? 1 : is_active;
    const comboPayload =
      combo_items && Array.isArray(combo_items)
        ? JSON.stringify(combo_items)
        : null;

    if (normalizedMaxDiscount === 0) {
      normalizedMaxDiscount = null;
    }
    if (!(discountTypeValue === 'order' && valueTypeValue === 'percent')) {
      normalizedMaxDiscount = null;
    }

    if (
      discountTypeValue === 'order' &&
      valueTypeValue === 'amount' &&
      (!normalizedMinPurchase || normalizedMinPurchase <= 0)
    ) {
      normalizedMinPurchase = normalizedValue;
    }

    const validationError = await validateDiscountPayload({
      discountType: discountTypeValue,
      valueType: valueTypeValue,
      normalizedValue,
      normalizedMaxDiscount,
      productId: productIdValue,
      productIds,
      normalizedMinPurchase,
      normalizedStock,
    });

    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    await pool.execute(
      `INSERT INTO discounts
        (id, name, code, description, discount_type, value, value_type, min_purchase, max_discount, stock, product_id, product_ids, min_quantity, is_multiple, combo_items, valid_from, valid_until, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        discountId,
        name,
        code,
        description ?? null,
        discountTypeValue,
        normalizedValue,
        valueTypeValue,
        normalizedMinPurchase,
        normalizedMaxDiscount,
        normalizedStock,
        productIdValue,
        productIdsPayload,
        normalizedMinQuantity,
        multipleValue,
        comboPayload,
        valid_from ?? null,
        valid_until ?? null,
        activeValue,
      ]
    );

    const [rows] = await pool.execute(
      `SELECT discounts.*, products.name AS product_name
       FROM discounts
       LEFT JOIN products ON discounts.product_id = products.id
       WHERE discounts.id = ?`,
      [discountId]
    );
    res.status(201).json(serializeDiscount(rows[0]));
  } catch (error) {
    console.error('Error creating discount:', error);
    res.status(500).json({ message: 'Gagal menambahkan diskon' });
  }
});

app.put('/discounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      code,
      description,
      discount_type,
      value,
      value_type,
      min_purchase,
      max_discount,
      stock,
      product_id,
      product_ids,
      min_quantity,
      is_multiple,
      combo_items,
      valid_from,
      valid_until,
      is_active,
    } = req.body;

    const discountTypeValue = discount_type || 'order';
    const valueTypeValue = value_type || 'amount';
    const normalizedValue = normalizeCurrency(value ?? 0);
    let normalizedMaxDiscount =
      max_discount !== undefined && max_discount !== null
        ? normalizeCurrency(max_discount)
        : null;
    let normalizedMinPurchase =
      min_purchase !== undefined && min_purchase !== null
        ? normalizeCurrency(min_purchase)
        : null;
    const normalizedStock = normalizeStock(stock);
    const normalizedMinQuantity =
      min_quantity !== undefined && min_quantity !== null
        ? Number(min_quantity)
        : 1;
    const productIds = Array.isArray(product_ids)
      ? product_ids.filter(Boolean)
      : product_id
        ? [product_id]
        : [];
    const productIdValue = productIds[0] ?? null;
    const productIdsPayload = productIds.length > 0 ? JSON.stringify(productIds) : null;
    const multipleValue =
      typeof is_multiple === 'undefined' ? 1 : is_multiple ? 1 : 0;
    const activeValue = typeof is_active === 'undefined' ? 1 : is_active;
    const comboPayload =
      combo_items && Array.isArray(combo_items)
        ? JSON.stringify(combo_items)
        : null;

    if (normalizedMaxDiscount === 0) {
      normalizedMaxDiscount = null;
    }
    if (!(discountTypeValue === 'order' && valueTypeValue === 'percent')) {
      normalizedMaxDiscount = null;
    }

    if (
      discountTypeValue === 'order' &&
      valueTypeValue === 'amount' &&
      (!normalizedMinPurchase || normalizedMinPurchase <= 0)
    ) {
      normalizedMinPurchase = normalizedValue;
    }

    const validationError = await validateDiscountPayload({
      discountType: discountTypeValue,
      valueType: valueTypeValue,
      normalizedValue,
      normalizedMaxDiscount,
      productId: productIdValue,
      productIds,
      normalizedMinPurchase,
      normalizedStock,
    });

    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    await pool.execute(
      `UPDATE discounts
       SET name = ?,
           code = ?,
           description = ?,
           discount_type = ?,
           value = ?,
           value_type = ?,
           min_purchase = ?,
          max_discount = ?,
          stock = ?,
          product_id = ?,
          product_ids = ?,
          min_quantity = ?,
          is_multiple = ?,
          combo_items = ?,
          valid_from = ?,
           valid_until = ?,
           is_active = ?
       WHERE id = ?`,
      [
        name,
        code,
        description ?? null,
        discountTypeValue,
        normalizedValue,
        valueTypeValue,
        normalizedMinPurchase,
        normalizedMaxDiscount,
        normalizedStock,
        productIdValue,
        productIdsPayload,
        normalizedMinQuantity,
        multipleValue,
        comboPayload,
        valid_from ?? null,
        valid_until ?? null,
        activeValue,
        id,
      ]
    );

    const [rows] = await pool.execute(
      `SELECT discounts.*, products.name AS product_name
       FROM discounts
       LEFT JOIN products ON discounts.product_id = products.id
       WHERE discounts.id = ?`,
      [id]
    );

    res.json(serializeDiscount(rows[0]));
  } catch (error) {
    console.error('Error updating discount:', error);
    res.status(500).json({ message: 'Gagal mengupdate diskon' });
  }
});

app.delete('/discounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM discounts WHERE id = ?', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting discount:', error);
    res.status(500).json({ message: 'Gagal menghapus diskon' });
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
      discount_id,
      discount_name,
      discount_code,
      discount_type,
      discount_value,
      discount_value_type,
      discount_amount,
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

    const normalizedDiscountValue =
      discount_value !== undefined && discount_value !== null
        ? normalizeCurrency(discount_value)
        : 0;
    const normalizedDiscountAmount =
      discount_amount !== undefined && discount_amount !== null
        ? normalizeCurrency(discount_amount)
        : 0;
    let shouldUpdateDiscountStock = false;

    if (discount_id) {
      const [discountRows] = await pool.execute(
        'SELECT stock FROM discounts WHERE id = ?',
        [discount_id]
      );
      if (!discountRows.length) {
        res.status(400).json({ message: 'Diskon tidak ditemukan.' });
        return;
      }
      const discountStock = discountRows[0].stock;
      if (discountStock !== null && Number(discountStock) <= 0) {
        res.status(400).json({ message: 'Stok diskon sudah habis.' });
        return;
      }
      shouldUpdateDiscountStock = discountStock !== null;
    }

    const [result] = await pool.execute(
      `INSERT INTO transactions
        (user_id, transaction_number, total_amount, discount_id, discount_name, discount_code, discount_type, discount_value, discount_value_type, discount_amount, payment_method, payment_amount, change_amount, status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        resolvedUserId,
        transaction_number,
        totalAmountValue,
        discount_id ?? null,
        discount_name ?? null,
        discount_code ?? null,
        discount_type ?? null,
        normalizedDiscountValue,
        discount_value_type ?? null,
        normalizedDiscountAmount,
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
    if (shouldUpdateDiscountStock) {
      await pool.execute(
        'UPDATE discounts SET stock = stock - 1 WHERE id = ? AND stock > 0',
        [discount_id]
      );
    }
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
