const mysql = require('mysql2/promise');

const DEFAULT_DB_NAME = process.env.DB_NAME || 'subscription_engine';

const baseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '0069'
};

const pool = mysql.createPool({
  ...baseConfig,
  database: DEFAULT_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name = ?
    `,
    [DEFAULT_DB_NAME, tableName]
  );

  return Number(rows?.[0]?.count || 0) > 0;
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
        AND column_name = ?
    `,
    [DEFAULT_DB_NAME, tableName, columnName]
  );

  return Number(rows?.[0]?.count || 0) > 0;
}

async function ensureDatabase() {
  const connection = await mysql.createConnection(baseConfig);

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DEFAULT_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.query(`USE \`${DEFAULT_DB_NAME}\``);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      plan VARCHAR(50) NOT NULL DEFAULT 'Free',
      download_limit INT NOT NULL DEFAULT 5,
      downloads_used INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  const hasPlansTable = await tableExists(connection, 'plans');
  if (!hasPlansTable) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        plan_name VARCHAR(50) NOT NULL UNIQUE,
        download_limit INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  await connection.query(
    `
      INSERT IGNORE INTO plans (plan_name, download_limit)
      VALUES
        ('Free', 5),
        ('Basic', 5),
        ('Pro', 50),
        ('Enterprise', 100),
        ('Premium', 50)
    `
  );

  if (!(await columnExists(connection, 'users', 'plan_id'))) {
    await connection.query(`ALTER TABLE users ADD COLUMN plan_id INT UNSIGNED NULL`);
  }
  if (!(await columnExists(connection, 'users', 'expiry_date'))) {
    await connection.query(`ALTER TABLE users ADD COLUMN expiry_date DATETIME NULL`);
  }

  await connection.query(
    `
      UPDATE users u
      JOIN plans p
        ON LOWER(p.plan_name) = LOWER(COALESCE(NULLIF(u.plan, ''), 'Free'))
      SET u.plan_id = p.id
      WHERE u.plan_id IS NULL
    `
  );

  await connection.query(
    `
      UPDATE users u
      JOIN plans p ON p.plan_name = 'Free'
      SET u.plan_id = p.id
      WHERE u.plan_id IS NULL
    `
  );

  await connection.query(
    `
      UPDATE users u
      JOIN plans p ON u.plan_id = p.id
      SET u.download_limit = p.download_limit
    `
  );

  await connection.end();
}

module.exports = {
  pool,
  ensureDatabase
};

