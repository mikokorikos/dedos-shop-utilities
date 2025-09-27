import mysql from 'mysql2/promise';
import pRetry from 'p-retry';
import { CONFIG } from '../config/config.js';
import { logger } from '../utils/logger.js';

export const pool = mysql.createPool({
  host: CONFIG.MYSQL.HOST,
  port: CONFIG.MYSQL.PORT,
  user: CONFIG.MYSQL.USER,
  password: CONFIG.MYSQL.PASSWORD,
  database: CONFIG.MYSQL.DATABASE,
  waitForConnections: true,
  connectionLimit: CONFIG.MYSQL.CONNECTION_LIMIT,
  queueLimit: 0,
  timezone: 'Z',
  multipleStatements: false,
  supportBigNumbers: true,
  bigNumberStrings: true,
});

async function pingConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function ensureDatabaseConnection() {
  await pRetry(() => pingConnection().then(() => logger.info('Conexión MySQL OK')), {
    retries: 5,
    onFailedAttempt: (error) => {
      logger.warn('Intento de conexión MySQL falló', error);
    },
  });
}
