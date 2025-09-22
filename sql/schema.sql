-- Esquema SQL para Dedos Shop Bot
-- Ejecuta estas sentencias en tu instancia MySQL antes de iniciar el bot si deseas crear las tablas manualmente.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  roblox_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS warns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  moderator_id BIGINT NULL,
  reason TEXT,
  severity ENUM('minor','major','critical') DEFAULT 'minor',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_warns_user_created (user_id, created_at DESC),
  CONSTRAINT fk_warns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_warns_moderator FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id BIGINT NOT NULL,
  channel_id BIGINT NOT NULL,
  owner_id BIGINT NOT NULL,
  type ENUM('buy','sell','robux','nitro','decor','mm') NOT NULL,
  status ENUM('open','closed','pending') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  INDEX idx_tickets_owner_status (owner_id, status),
  INDEX idx_tickets_channel (channel_id),
  CONSTRAINT fk_tickets_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_participants (
  ticket_id INT NOT NULL,
  user_id BIGINT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id, user_id),
  CONSTRAINT fk_tp_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_tp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mm_trades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  user_id BIGINT NOT NULL,
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
) ENGINE=InnoDB;
