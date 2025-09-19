import { createPool } from 'mysql2/promise';

export const createDatabasePool = (config, logger) => {
  if (!config.DB_HOST) {
    logger.warn('[DB] No se configuró DB_HOST. Las funciones que dependen de la base de datos estarán deshabilitadas.');
    return null;
  }

  const pool = createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    waitForConnections: true,
    connectionLimit: Math.max(1, config.DB_POOL_LIMIT || 10),
    charset: 'utf8mb4_unicode_ci',
  });

  pool.on('connection', () => logger.debug('[DB] Nueva conexión creada.'));
  pool.on('acquire', () => logger.silly('[DB] Conexión tomada del pool.'));
  pool.on('release', () => logger.silly('[DB] Conexión devuelta al pool.'));

  return pool;
};
