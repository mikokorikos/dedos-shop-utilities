-- Esquema MySQL para el sistema de utilidades de Dedos
-- Todas las tablas usan InnoDB para garantizar integridad referencial.

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id            VARCHAR(20)  NOT NULL,
  user_id             VARCHAR(20)  NOT NULL,
  first_seen_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_warn_at        DATETIME     NULL,
  PRIMARY KEY (guild_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warns (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  guild_id            VARCHAR(20)  NOT NULL,
  user_id             VARCHAR(20)  NOT NULL,
  moderator_id        VARCHAR(20)  NOT NULL,
  reason              VARCHAR(1900) NULL,
  points              INT          NOT NULL DEFAULT 1,
  context_message_url VARCHAR(255) NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_warns_user (guild_id, user_id),
  CONSTRAINT fk_warn_member FOREIGN KEY (guild_id, user_id) REFERENCES guild_members (guild_id, user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_amnesties (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  guild_id         VARCHAR(20)  NOT NULL,
  moderator_id     VARCHAR(20)  NOT NULL,
  user_id          VARCHAR(20)  NOT NULL,
  action           ENUM('remove_warn') NOT NULL,
  reason           VARCHAR(255) NULL,
  target_reference VARCHAR(64)  NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_amnesty_user (guild_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
