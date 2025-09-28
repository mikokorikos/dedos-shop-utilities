-- =========================================
-- Dedos Shop Bot - DB (Normalizado v2)
-- =========================================

CREATE DATABASE IF NOT EXISTS dedos_shop
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dedos_shop;

SET NAMES utf8mb4;
SET time_zone = "+00:00";
SET sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE';

-- ===========================
-- Catálogos (antes ENUMs)
-- ===========================

CREATE TABLE warn_severities (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(16) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT IGNORE INTO warn_severities (id, name) VALUES
  (1,'minor'), (2,'major'), (3,'critical');

CREATE TABLE ticket_types (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(32) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT IGNORE INTO ticket_types (id, name) VALUES
  (1,'buy'),(2,'sell'),(3,'robux'),(4,'nitro'),(5,'decor'),(6,'mm');

CREATE TABLE ticket_statuses (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(16) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT IGNORE INTO ticket_statuses (id, name) VALUES
  (1,'OPEN'),(2,'CONFIRMED'),(3,'CLAIMED'),(4,'CLOSED');

-- =========================================
-- Usuarios (Discord y Roblox)
-- =========================================

CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY,     -- Discord snowflake
  roblox_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =========================================
-- Warns
-- =========================================

CREATE TABLE warns (
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
) ENGINE=InnoDB;

-- =========================================
-- Tickets
-- =========================================

CREATE TABLE tickets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id BIGINT UNSIGNED NOT NULL,
  channel_id BIGINT UNSIGNED NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  type_id TINYINT UNSIGNED NOT NULL,
  status_id TINYINT UNSIGNED NOT NULL DEFAULT 1, -- OPEN

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  INDEX idx_tickets_owner_status (owner_id, status_id),
  INDEX idx_tickets_channel (channel_id),
  INDEX idx_tickets_guild_created (guild_id, created_at DESC),
  CONSTRAINT fk_tickets_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tickets_type FOREIGN KEY (type_id) REFERENCES ticket_types(id),
  CONSTRAINT fk_tickets_status FOREIGN KEY (status_id) REFERENCES ticket_statuses(id)
) ENGINE=InnoDB;

CREATE TABLE ticket_participants (
  ticket_id INT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(24) NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id, user_id),
  INDEX idx_tp_user (user_id),
  CONSTRAINT fk_tp_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_tp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================================
-- Middlemen
-- =========================================

CREATE TABLE middlemen (
  user_id BIGINT UNSIGNED PRIMARY KEY, -- FK a users
  roblox_username VARCHAR(255) NOT NULL,
  roblox_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_middlemen_roblox (roblox_user_id),
  CONSTRAINT fk_middlemen_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================================
-- Trades
-- =========================================

CREATE TABLE mm_trades (
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
) ENGINE=InnoDB;

CREATE TABLE mm_trade_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trade_id INT UNSIGNED NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  metadata JSON NULL,
  INDEX idx_trade_items_trade (trade_id),
  CONSTRAINT fk_trade_items FOREIGN KEY (trade_id) REFERENCES mm_trades(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================================
-- Claims / Reviews / Finalización
-- =========================================

CREATE TABLE mm_claims (
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
) ENGINE=InnoDB;

CREATE TABLE mm_reviews (
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
) ENGINE=InnoDB;

CREATE TABLE mm_trade_finalizations (
  ticket_id INT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id, user_id),
  CONSTRAINT fk_mtf_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_mtf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================================
-- Estadísticas de miembros (solo acumulado)
-- =========================================

CREATE TABLE member_trade_stats (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  trades_completed INT NOT NULL DEFAULT 0,
  last_trade_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mm_trade_finalizations (
  ticket_id INT NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id, user_id),
  CONSTRAINT fk_mtf_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_mtf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;


CREATE TABLE IF NOT EXISTS member_trade_stats (
  discord_user_id VARCHAR(20) PRIMARY KEY,
  roblox_username VARCHAR(255) NULL,
  roblox_user_id BIGINT NULL,
  partner_roblox_username VARCHAR(255) NULL,
  partner_roblox_user_id BIGINT NULL,
  trades_completed INT NOT NULL DEFAULT 0,
  last_trade_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_member_trades_count (trades_completed DESC)
) ENGINE=InnoDB;
