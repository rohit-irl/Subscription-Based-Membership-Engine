const express = require('express');
const cors = require('cors');
const { pool, ensureDatabase } = require('./db');
const { authRequired } = require('./middleware/auth');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

const FRONTEND_ORIGINS = [
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

const PREMIUM_PLAN_NAME = 'Premium';
const FREE_PLAN_NAME = 'Free';
const FREE_DOWNLOAD_LIMIT = 5;
const PREMIUM_DOWNLOAD_LIMIT = 50;

const DEFAULT_DOWNLOAD_URL =
  process.env.DOWNLOAD_URL || 'http://127.0.0.1:5500/downloads/sample.pdf';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (FRONTEND_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(express.json());

function formatUserResponse(user, message) {
  if (!user) return null;

  const remainingDownloads = Math.max(
    (user.download_limit || 0) - (user.downloads_used || 0),
    0
  );

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan,
    downloadLimit: user.download_limit,
    downloadsUsed: user.downloads_used,
    remainingDownloads,
    message,
    token: user?.id
      ? jwt.sign({ userId: String(user.id) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
      : undefined
  };
}

async function getPlanByName(connection, planName) {
  const name = typeof planName === 'string' && planName.trim() ? planName.trim() : FREE_PLAN_NAME;
  const [rows] = await connection.query(
    'SELECT id, plan_name, download_limit FROM plans WHERE LOWER(plan_name) = LOWER(?) LIMIT 1',
    [name]
  );
  if (rows.length > 0) return rows[0];

  const [fallback] = await connection.query(
    'SELECT id, plan_name, download_limit FROM plans WHERE plan_name = ? LIMIT 1',
    [FREE_PLAN_NAME]
  );
  return fallback[0];
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is running. Use API endpoints under /api or documented routes.'
  });
});

app.post('/register', async (req, res) => {
  const { name, email, password, plan } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({
      message: 'name, email and password are required.'
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    const [existingRows] = await connection.query(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingRows.length > 0) {
      const existingUser = existingRows[0];
      return res.status(200).json(
        formatUserResponse(existingUser, 'User already exists. Logged in.')
      );
    }

    const selectedPlan = await getPlanByName(connection, plan);
    const normalizedPlan = selectedPlan.plan_name || FREE_PLAN_NAME;
    const initialDownloadLimit = selectedPlan.download_limit ?? FREE_DOWNLOAD_LIMIT;

    const [insertResult] = await connection.query(
      'INSERT INTO users (name, email, password, plan, plan_id, download_limit, downloads_used, expiry_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, email, password, normalizedPlan, selectedPlan.id, initialDownloadLimit, 0, null]
    );

    const newUserId = insertResult.insertId;
    const [rows] = await connection.query('SELECT * FROM users WHERE id = ?', [
      newUserId
    ]);
    const user = rows[0];

    return res
      .status(201)
      .json(formatUserResponse(user, 'Registration successful.'));
  } catch (error) {
    // Duplicate email safeguard
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'Email is already registered.'
      });
    }

    console.error('Error in /register:', error);
    return res.status(500).json({
      message: 'Internal server error while registering user.'
    });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/user/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'User id is required.' });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query(
      `
        SELECT 
          u.id,
          u.name,
          u.email,
          p.plan_name,
          u.expiry_date,
          u.downloads_used,
          p.download_limit
        FROM users u
        JOIN plans p ON u.plan_id = p.id
        WHERE u.id = ?
        LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = rows[0];
    const remainingDownloads = Math.max(
      (user.download_limit || 0) - (user.downloads_used || 0),
      0
    );

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      plan_name: user.plan_name,
      expiry_date: user.expiry_date,
      downloads_used: user.downloads_used,
      download_limit: user.download_limit,
      remainingDownloads
    });
  } catch (error) {
    console.error('Error in /user/:id:', error);
    return res.status(500).json({
      message: 'Internal server error while fetching user.'
    });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/upgrade', async (req, res) => {
  const { userId } = req.body || {};

  if (!userId) {
    return res.status(400).json({ message: 'userId is required.' });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT * FROM users WHERE id = ?', [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = rows[0];
    const currentPlan = (user.plan || '').toLowerCase();

    if (currentPlan === PREMIUM_PLAN_NAME.toLowerCase()) {
      return res
        .status(400)
        .json({ message: 'User is already on the highest plan.' });
    }

    const premiumPlan = await getPlanByName(connection, PREMIUM_PLAN_NAME);
    await connection.query(
      `
        UPDATE users
        SET plan = ?,
            plan_id = ?,
            download_limit = ?,
            expiry_date = DATE_ADD(NOW(), INTERVAL 30 DAY)
        WHERE id = ?
      `,
      [PREMIUM_PLAN_NAME, premiumPlan.id, premiumPlan.download_limit ?? PREMIUM_DOWNLOAD_LIMIT, userId]
    );

    const [updatedRows] = await connection.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
    const updatedUser = updatedRows[0];

    return res.json(
      formatUserResponse(updatedUser, 'Plan upgraded successfully.')
    );
  } catch (error) {
    console.error('Error in /upgrade:', error);
    return res.status(500).json({
      message: 'Internal server error while upgrading plan.'
    });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/download', async (req, res) => {
  const { userId } = req.body || {};

  if (!userId) {
    return res.status(400).json({ message: 'userId is required.' });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT * FROM users WHERE id = ?', [
      userId
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = rows[0];
    const remaining =
      (user.download_limit || 0) - (user.downloads_used || 0);

    if (remaining <= 0) {
      return res.status(403).json({
        message: 'Download limit reached.',
        remainingDownloads: 0
      });
    }

    await connection.query(
      'UPDATE users SET downloads_used = downloads_used + 1 WHERE id = ?',
      [userId]
    );

    const [updatedRows] = await connection.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
    const updatedUser = updatedRows[0];

    return res.json({
      ...formatUserResponse(updatedUser, 'Download allowed.'),
      url: DEFAULT_DOWNLOAD_URL
    });
  } catch (error) {
    console.error('Error in /download:', error);
    return res.status(500).json({
      message: 'Internal server error while processing download.'
    });
  } finally {
    if (connection) connection.release();
  }
});

// -------------------------
// Profile API (session/JWT)
// -------------------------

app.get('/api/profile', authRequired, async (req, res) => {
  const userId = req.userId;

  let connection;
  try {
    connection = await pool.getConnection();

    const [rows] = await connection.query(
      `
        SELECT 
            u.id,
            u.name,
            u.email,
            p.plan_name,
            u.expiry_date,
            u.downloads_used,
            p.download_limit
        FROM users u
        JOIN plans p ON u.plan_id = p.id
        WHERE u.id = ?;
      `,
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const profile = rows[0];

    return res.json({
      id: profile.id,
      name: profile.name,
      email: profile.email,
      plan_name: profile.plan_name,
      expiry_date: profile.expiry_date,
      downloads_used: profile.downloads_used,
      download_limit: profile.download_limit
    });
  } catch (error) {
    console.error('Error in GET /api/profile:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/api/logout', (req, res) => {
  // Session logout (if sessions exist). JWT logout is handled client-side by removing token.
  if (req.session && typeof req.session.destroy === 'function') {
    req.session.destroy(() => {
      res.json({ message: 'Logged out.' });
    });
    return;
  }

  res.json({ message: 'Logged out.' });
});

async function start() {
  try {
    await ensureDatabase();
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Backend API listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

