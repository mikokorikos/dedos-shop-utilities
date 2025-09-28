import { pool } from './db.js';
import { logger } from '../utils/logger.js';

const BASE_DDL = [
  `CREATE TABLE IF NOT EXISTS warn_severities (
    id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(16) NOT NULL UNIQUE
  ) ENGINE=InnoDB`,
  `INSERT IGNORE INTO warn_severities (id, name) VALUES (1,'minor'), (2,'major'), (3,'critical')`,
  `CREATE TABLE IF NOT EXISTS ticket_types (
    id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(32) NOT NULL UNIQUE
  ) ENGINE=InnoDB`,
  `INSERT IGNORE INTO ticket_types (id, name) VALUES (1,'buy'),(2,'sell'),(3,'robux'),(4,'nitro'),(5,'decor'),(6,'mm')`,
  `CREATE TABLE IF NOT EXISTS ticket_statuses (
    id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(16) NOT NULL UNIQUE
  ) ENGINE=InnoDB`,
  `INSERT IGNORE INTO ticket_statuses (id, name) VALUES (1,'OPEN'),(2,'CONFIRMED'),(3,'CLAIMED'),(4,'CLOSED')`,
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED PRIMARY KEY,
    roblox_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS warns (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    moderator_id BIGINT UNSIGNED NULL,
    severity_id TINYINT UNSIGNED NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_warns_user_created (user_id, created_at DESC),
    CONSTRAINT fk_warns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_warns_mod FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_warns_sev FOREIGN KEY (severity_id) REFERENCES warn_severities(id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    guild_id BIGINT UNSIGNED NOT NULL,
    channel_id BIGINT UNSIGNED NOT NULL,
    owner_id BIGINT UNSIGNED NOT NULL,
    type_id TINYINT UNSIGNED NOT NULL,
    status_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    INDEX idx_tickets_owner_status (owner_id, status_id),
    INDEX idx_tickets_channel (channel_id),
    INDEX idx_tickets_guild_created (guild_id, created_at DESC),
    CONSTRAINT fk_tickets_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_tickets_type FOREIGN KEY (type_id) REFERENCES ticket_types(id),
    CONSTRAINT fk_tickets_status FOREIGN KEY (status_id) REFERENCES ticket_statuses(id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS ticket_participants (
    ticket_id INT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    role VARCHAR(24) NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(ticket_id, user_id),
    INDEX idx_tp_user (user_id),
    CONSTRAINT fk_tp_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_tp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS middlemen (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    roblox_username VARCHAR(255) NOT NULL,
    roblox_user_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_middlemen_roblox (roblox_user_id),
    CONSTRAINT fk_middlemen_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mm_trades (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    roblox_username VARCHAR(255) NOT NULL,
    roblox_user_id BIGINT UNSIGNED NULL,
    confirmed TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_mm_ticket_user (ticket_id, user_id),
    INDEX idx_mm_trades_ticket (ticket_id),
    CONSTRAINT fk_mmtr_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_mmtr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mm_trade_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    trade_id INT UNSIGNED NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    metadata JSON NULL,
    INDEX idx_trade_items_trade (trade_id),
    CONSTRAINT fk_trade_items FOREIGN KEY (trade_id) REFERENCES mm_trades(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mm_reviews (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT UNSIGNED NOT NULL,
    reviewer_id BIGINT UNSIGNED NOT NULL,
    middleman_id BIGINT UNSIGNED NOT NULL,
    stars TINYINT NOT NULL CHECK (stars BETWEEN 0 AND 5),
    review_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_ticket_reviewer (ticket_id, reviewer_id),
    INDEX idx_reviews_mm (middleman_id, created_at DESC),
    CONSTRAINT fk_reviews_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_middleman FOREIGN KEY (middleman_id) REFERENCES middlemen(user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mm_claims (
    ticket_id INT UNSIGNED PRIMARY KEY,
    middleman_id BIGINT UNSIGNED NOT NULL,
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    review_requested_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    vouched TINYINT(1) NOT NULL DEFAULT 0,
    forced_close TINYINT(1) NOT NULL DEFAULT 0,
    panel_message_id BIGINT UNSIGNED NULL,
    finalization_message_id BIGINT UNSIGNED NULL,
    INDEX idx_claims_mm (middleman_id, claimed_at DESC),
    CONSTRAINT fk_claim_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_claim_middleman FOREIGN KEY (middleman_id) REFERENCES middlemen(user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mm_trade_finalizations (
    ticket_id INT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(ticket_id, user_id),
    CONSTRAINT fk_mtf_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_mtf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS member_trade_stats (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    trades_completed INT NOT NULL DEFAULT 0,
    last_trade_at TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_mts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
];

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(table, index) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
}

async function foreignKeyExists(table, constraint) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? AND TABLE_NAME = ? LIMIT 1`,
    [constraint, table]
  );
  return rows.length > 0;
}

async function addColumn(table, column, definition) {
  if (!(await columnExists(table, column))) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function dropColumn(table, column) {
  if (await columnExists(table, column)) {
    await pool.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
}

async function dropForeignKey(table, constraint) {
  if (await foreignKeyExists(table, constraint)) {
    await pool.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${constraint}`);
  }
}

async function addIndex(table, index, definition) {
  if (!(await indexExists(table, index))) {
    await pool.query(`ALTER TABLE ${table} ADD INDEX ${index} ${definition}`);
  }
}

async function ensureUsersSchema() {
  await pool.query('ALTER TABLE users MODIFY COLUMN id BIGINT UNSIGNED PRIMARY KEY');
  await pool.query('ALTER TABLE users MODIFY COLUMN roblox_id BIGINT UNSIGNED NULL');
}

async function ensureWarnsSchema() {
  await addColumn('warns', 'severity_id', 'TINYINT UNSIGNED NULL');
  if (await columnExists('warns', 'severity')) {
    await pool.query(
      `UPDATE warns w
         JOIN warn_severities ws ON ws.name = w.severity
       SET w.severity_id = ws.id
       WHERE w.severity_id IS NULL`
    );
  }
  await pool.query('UPDATE warns SET severity_id = 1 WHERE severity_id IS NULL');
  await pool.query('ALTER TABLE warns MODIFY COLUMN severity_id TINYINT UNSIGNED NOT NULL');
  await dropColumn('warns', 'severity');
  await pool.query('ALTER TABLE warns MODIFY COLUMN user_id BIGINT UNSIGNED NOT NULL');
  await pool.query('ALTER TABLE warns MODIFY COLUMN moderator_id BIGINT UNSIGNED NULL');
  await addIndex('warns', 'idx_warns_user_created', '(user_id, created_at DESC)');
  await dropForeignKey('warns', 'fk_warns_moderator');
  await dropForeignKey('warns', 'fk_warns_mod');
  await dropForeignKey('warns', 'fk_warns_user');
  await dropForeignKey('warns', 'fk_warns_sev');
  await pool.query(
    `ALTER TABLE warns
       ADD CONSTRAINT fk_warns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
       ADD CONSTRAINT fk_warns_mod FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL,
       ADD CONSTRAINT fk_warns_sev FOREIGN KEY (severity_id) REFERENCES warn_severities(id)`
  );
}

async function ensureTicketsSchema() {
  await addColumn('tickets', 'type_id', 'TINYINT UNSIGNED NULL');
  await addColumn('tickets', 'status_id', 'TINYINT UNSIGNED NULL');
  if (await columnExists('tickets', 'type')) {
    await pool.query(
      `UPDATE tickets t
         JOIN ticket_types tt ON tt.name = t.type
       SET t.type_id = tt.id
       WHERE t.type_id IS NULL`
    );
  }
  if (await columnExists('tickets', 'status')) {
    await pool.query(
      `UPDATE tickets t
         JOIN ticket_statuses ts ON ts.name = t.status
       SET t.status_id = ts.id
       WHERE t.status_id IS NULL`
    );
  }
  await pool.query('UPDATE tickets SET status_id = 1 WHERE status_id IS NULL');
  await pool.query('ALTER TABLE tickets MODIFY COLUMN type_id TINYINT UNSIGNED NOT NULL');
  await pool.query('ALTER TABLE tickets MODIFY COLUMN status_id TINYINT UNSIGNED NOT NULL DEFAULT 1');
  await dropColumn('tickets', 'type');
  await dropColumn('tickets', 'status');
  await pool.query('ALTER TABLE tickets MODIFY COLUMN guild_id BIGINT UNSIGNED NOT NULL');
  await pool.query('ALTER TABLE tickets MODIFY COLUMN channel_id BIGINT UNSIGNED NOT NULL');
  await pool.query('ALTER TABLE tickets MODIFY COLUMN owner_id BIGINT UNSIGNED NOT NULL');
  await addIndex('tickets', 'idx_tickets_owner_status', '(owner_id, status_id)');
  await addIndex('tickets', 'idx_tickets_channel', '(channel_id)');
  await addIndex('tickets', 'idx_tickets_guild_created', '(guild_id, created_at DESC)');
  await dropForeignKey('tickets', 'fk_tickets_owner');
  await dropForeignKey('tickets', 'fk_tickets_type');
  await dropForeignKey('tickets', 'fk_tickets_status');
  await pool.query(
    `ALTER TABLE tickets
       ADD CONSTRAINT fk_tickets_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
       ADD CONSTRAINT fk_tickets_type FOREIGN KEY (type_id) REFERENCES ticket_types(id),
       ADD CONSTRAINT fk_tickets_status FOREIGN KEY (status_id) REFERENCES ticket_statuses(id)`
  );
}

async function ensureTicketParticipantsSchema() {
  await addColumn('ticket_participants', 'role', 'VARCHAR(24) NULL');
  await pool.query('ALTER TABLE ticket_participants MODIFY COLUMN ticket_id INT UNSIGNED NOT NULL');
  await pool.query('ALTER TABLE ticket_participants MODIFY COLUMN user_id BIGINT UNSIGNED NOT NULL');
  await addIndex('ticket_participants', 'idx_tp_user', '(user_id)');
  await dropForeignKey('ticket_participants', 'fk_tp_ticket');
  await dropForeignKey('ticket_participants', 'fk_tp_user');
  await pool.query(
    `ALTER TABLE ticket_participants
       ADD CONSTRAINT fk_tp_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
       ADD CONSTRAINT fk_tp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
  );
}

async function ensureMiddlemenSchema() {
  if (await columnExists('middlemen', 'discord_user_id')) {
    await dropForeignKey('middlemen', 'fk_middlemen_user');
    await pool.query('ALTER TABLE middlemen DROP PRIMARY KEY');
    if (await columnExists('middlemen', 'id')) {
      await pool.query('ALTER TABLE middlemen DROP COLUMN id');
    }
    await pool.query('ALTER TABLE middlemen CHANGE COLUMN discord_user_id user_id BIGINT UNSIGNED NOT NULL');
    await pool.query('ALTER TABLE middlemen ADD PRIMARY KEY (user_id)');
  }
  await dropColumn('middlemen', 'vouches_count');
  await dropColumn('middlemen', 'rating_sum');
  await dropColumn('middlemen', 'rating_count');
  await addColumn('middlemen', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  await addColumn('middlemen', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await pool.query('ALTER TABLE middlemen MODIFY COLUMN roblox_user_id BIGINT UNSIGNED NULL');
  await addIndex('middlemen', 'idx_middlemen_roblox', '(roblox_user_id)');
  await dropForeignKey('middlemen', 'fk_middlemen_user');
  await pool.query(
    `ALTER TABLE middlemen
       ADD CONSTRAINT fk_middlemen_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
  );
}

async function migrateTradeItems() {
  if (!(await columnExists('mm_trades', 'items'))) {
    return;
  }
  const [rows] = await pool.query('SELECT id, items FROM mm_trades WHERE items IS NOT NULL AND items <> ""');
  for (const row of rows) {
    const itemName = row.items.length > 255 ? `${row.items.slice(0, 252)}...` : row.items;
    const metadata = JSON.stringify({ details: row.items });
    await pool.query(
      `INSERT INTO mm_trade_items (trade_id, item_name, quantity, metadata)
       SELECT ?, ?, 1, ?
       WHERE NOT EXISTS (SELECT 1 FROM mm_trade_items WHERE trade_id = ? LIMIT 1)`,
      [row.id, itemName, metadata, row.id]
    );
  }
  await pool.query('ALTER TABLE mm_trades DROP COLUMN items');
}

async function ensureMmTradesSchema() {
  await pool.query('ALTER TABLE mm_trades MODIFY COLUMN ticket_id INT UNSIGNED NOT NULL');
  await pool.query('ALTER TABLE mm_trades MODIFY COLUMN user_id BIGINT UNSIGNED NOT NULL');
  await pool.query('ALTER TABLE mm_trades MODIFY COLUMN roblox_user_id BIGINT UNSIGNED NULL');
  await migrateTradeItems();
  await addIndex('mm_trades', 'idx_mm_trades_ticket', '(ticket_id)');
  await dropForeignKey('mm_trades', 'fk_mm_ticket');
  await dropForeignKey('mm_trades', 'fk_mm_user');
  await dropForeignKey('mm_trades', 'fk_mmtr_ticket');
  await dropForeignKey('mm_trades', 'fk_mmtr_user');
  await pool.query(
    `ALTER TABLE mm_trades
       ADD CONSTRAINT fk_mmtr_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
       ADD CONSTRAINT fk_mmtr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
  );
}

async function ensureMmReviewsSchema() {
  if (await columnExists('mm_reviews', 'reviewer_user_id')) {
    await dropForeignKey('mm_reviews', 'fk_reviews_mm');
    await dropForeignKey('mm_reviews', 'fk_reviews_ticket');
    await pool.query('ALTER TABLE mm_reviews CHANGE COLUMN reviewer_user_id reviewer_id BIGINT UNSIGNED NOT NULL');
    await pool.query('ALTER TABLE mm_reviews CHANGE COLUMN middleman_user_id middleman_id BIGINT UNSIGNED NOT NULL');
  }
  await pool.query('ALTER TABLE mm_reviews MODIFY COLUMN reviewer_id BIGINT UNSIGNED NOT NULL');
  await pool.query('ALTER TABLE mm_reviews MODIFY COLUMN middleman_id BIGINT UNSIGNED NOT NULL');
  await addIndex('mm_reviews', 'idx_reviews_mm', '(middleman_id, created_at DESC)');
  await dropForeignKey('mm_reviews', 'fk_reviews_ticket');
  await dropForeignKey('mm_reviews', 'fk_reviews_reviewer');
  await dropForeignKey('mm_reviews', 'fk_reviews_middleman');
  await pool.query(
    `ALTER TABLE mm_reviews
       ADD CONSTRAINT fk_reviews_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
       ADD CONSTRAINT fk_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
       ADD CONSTRAINT fk_reviews_middleman FOREIGN KEY (middleman_id) REFERENCES middlemen(user_id) ON DELETE CASCADE`
  );
}

async function ensureMmClaimsSchema() {
  if (await columnExists('mm_claims', 'middleman_user_id')) {
    await dropForeignKey('mm_claims', 'fk_claim_middleman');
    await pool.query('ALTER TABLE mm_claims CHANGE COLUMN middleman_user_id middleman_id BIGINT UNSIGNED NOT NULL');
  }
  await addColumn('mm_claims', 'panel_message_id', 'BIGINT UNSIGNED NULL');
  await addColumn('mm_claims', 'finalization_message_id', 'BIGINT UNSIGNED NULL');
  await pool.query('ALTER TABLE mm_claims MODIFY COLUMN middleman_id BIGINT UNSIGNED NOT NULL');
  await dropForeignKey('mm_claims', 'fk_claim_ticket');
  await dropForeignKey('mm_claims', 'fk_claim_middleman');
  await pool.query(
    `ALTER TABLE mm_claims
       ADD CONSTRAINT fk_claim_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
       ADD CONSTRAINT fk_claim_middleman FOREIGN KEY (middleman_id) REFERENCES middlemen(user_id) ON DELETE CASCADE`
  );
}

async function ensureMemberTradeStatsSchema() {
  if (await columnExists('member_trade_stats', 'discord_user_id')) {
    await pool.query('ALTER TABLE member_trade_stats CHANGE COLUMN discord_user_id user_id BIGINT UNSIGNED NOT NULL');
  }
  await dropColumn('member_trade_stats', 'roblox_username');
  await dropColumn('member_trade_stats', 'roblox_user_id');
  await dropColumn('member_trade_stats', 'partner_roblox_username');
  await dropColumn('member_trade_stats', 'partner_roblox_user_id');
  await addIndex('member_trade_stats', 'idx_member_trades_count', '(trades_completed DESC)');
  await pool.query('ALTER TABLE member_trade_stats MODIFY COLUMN user_id BIGINT UNSIGNED PRIMARY KEY');
  await pool.query('ALTER TABLE member_trade_stats MODIFY COLUMN trades_completed INT NOT NULL DEFAULT 0');
  await dropForeignKey('member_trade_stats', 'fk_mts_user');
  await pool.query(
    `ALTER TABLE member_trade_stats
       ADD CONSTRAINT fk_mts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
  );
}

export async function runMigrations() {
  for (const query of BASE_DDL) {
    await pool.query(query);
  }

  await ensureUsersSchema();
  await ensureWarnsSchema();
  await ensureTicketsSchema();
  await ensureTicketParticipantsSchema();
  await ensureMiddlemenSchema();
  await ensureMmTradesSchema();
  await ensureMmReviewsSchema();
  await ensureMmClaimsSchema();
  await ensureMemberTradeStatsSchema();

  logger.info('Migraciones normalizadas ejecutadas');
}
