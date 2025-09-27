import { pool } from './db.js';
import { logger } from '../utils/logger.js';

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(20) PRIMARY KEY,
    roblox_id BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS warns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    moderator_id VARCHAR(20) NULL,
    reason TEXT,
    severity ENUM('minor','major','critical') DEFAULT 'minor',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_warns_user_created (user_id, created_at DESC),
    CONSTRAINT fk_warns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_warns_moderator FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    owner_id VARCHAR(20) NOT NULL,
    type ENUM('buy','sell','robux','nitro','decor','mm') NOT NULL,
    status ENUM('open','closed','pending') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    INDEX idx_tickets_owner_status (owner_id, status),
    INDEX idx_tickets_channel (channel_id),
    CONSTRAINT fk_tickets_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS ticket_participants (
    ticket_id INT NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(ticket_id, user_id),
    CONSTRAINT fk_tp_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_tp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mm_trades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    roblox_username VARCHAR(255) NOT NULL,
    roblox_user_id BIGINT NULL,
    items TEXT NOT NULL,
    confirmed TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mm_trades_ticket (ticket_id),
    UNIQUE KEY uniq_mm_ticket_user (ticket_id, user_id),
    CONSTRAINT fk_mm_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_mm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS middlemen (
    id INT AUTO_INCREMENT PRIMARY KEY,
    discord_user_id VARCHAR(20) NOT NULL UNIQUE,
    roblox_username VARCHAR(255) NOT NULL,
    roblox_user_id BIGINT NULL,
    vouches_count INT NOT NULL DEFAULT 0,
    rating_sum INT NOT NULL DEFAULT 0,
    rating_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_middlemen_rating (rating_count, rating_sum)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mm_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    reviewer_user_id VARCHAR(20) NOT NULL,
    middleman_user_id VARCHAR(20) NOT NULL,
    stars TINYINT NOT NULL CHECK (stars BETWEEN 0 AND 5),
    review_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_ticket_reviewer (ticket_id, reviewer_user_id),
    INDEX idx_reviews_mm (middleman_user_id, created_at DESC),
    CONSTRAINT fk_reviews_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_mm FOREIGN KEY (middleman_user_id) REFERENCES middlemen(discord_user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mm_claims (
    ticket_id INT PRIMARY KEY,
    middleman_user_id VARCHAR(20) NOT NULL,
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    review_requested_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    vouched TINYINT(1) NOT NULL DEFAULT 0,
    forced_close TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_claims_mm (middleman_user_id, claimed_at DESC),
    CONSTRAINT fk_claim_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_claim_middleman FOREIGN KEY (middleman_user_id) REFERENCES middlemen(discord_user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`
];

export async function runMigrations() {
  for (const migration of MIGRATIONS) {
    await pool.query(migration);
  }
  logger.info('Migraciones ejecutadas');
}
