const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'skillbadge_ai',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Helper function to test DB connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`[Database] Successfully connected to MySQL database: ${process.env.DB_NAME || 'skillbadge_ai'}`);
    connection.release();
    return true;
  } catch (error) {
    console.warn(`[Database Warning] Could not connect to database '${process.env.DB_NAME || 'skillbadge_ai'}':`, error.message);
    console.warn('[Database Warning] Verify that MySQL is running and the database exists (see config/schema.sql).');
    return false;
  }
};

module.exports = {
  pool,
  testConnection
};
