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

CREATE TABLE IF NOT EXISTS event_sessions (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  guild_id       VARCHAR(20)  NOT NULL,
  name           VARCHAR(120) NOT NULL,
  created_by     VARCHAR(20)  NOT NULL,
  message_id     VARCHAR(20)  NULL,
  channel_id     VARCHAR(20)  NULL,
  status         ENUM('active', 'finished', 'archived') NOT NULL DEFAULT 'active',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at    DATETIME     NULL,
  finished_by    VARCHAR(20)  NULL,
  finish_reason  VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_event_sessions_status (guild_id, status),
  KEY idx_event_sessions_message (guild_id, message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_participants (
  session_id          BIGINT       NOT NULL,
  guild_id            VARCHAR(20)  NOT NULL,
  user_id             VARCHAR(20)  NOT NULL,
  state               ENUM('active', 'reminded', 'warned', 'expelled', 'banned') NOT NULL DEFAULT 'active',
  last_state_reason   VARCHAR(32)  NULL,
  reminders_sent      INT          NOT NULL DEFAULT 0,
  warnings_sent       INT          NOT NULL DEFAULT 0,
  expulsions_count    INT          NOT NULL DEFAULT 0,
  joined_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_state_change_at DATETIME    NULL,
  last_check_at       DATETIME     NULL,
  PRIMARY KEY (session_id, user_id),
  KEY idx_event_participants_guild (guild_id, user_id),
  CONSTRAINT fk_participant_session FOREIGN KEY (session_id) REFERENCES event_sessions (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_sanction_counters (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  guild_id          VARCHAR(20)  NOT NULL,
  user_id           VARCHAR(20)  NOT NULL,
  reason            ENUM('missing_tag', 'missing_bio', 'manual') NOT NULL,
  reminders         INT          NOT NULL DEFAULT 0,
  warnings          INT          NOT NULL DEFAULT 0,
  expulsions        INT          NOT NULL DEFAULT 0,
  permanent_ban_at  DATETIME     NULL,
  last_action       ENUM('reminder', 'warning', 'expulsion', 'permanent_ban', 'amnesty') NULL,
  last_action_at    DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_sanction (guild_id, user_id, reason)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_verification_checks (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  session_id    BIGINT       NOT NULL,
  guild_id      VARCHAR(20)  NOT NULL,
  user_id       VARCHAR(20)  NOT NULL,
  checked_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tag_ok        TINYINT(1)   NOT NULL DEFAULT 0,
  bio_ok        TINYINT(1)   NOT NULL DEFAULT 0,
  action_taken  ENUM('none', 'reminder', 'warning', 'expulsion', 'permanent_ban') NOT NULL DEFAULT 'none',
  details       VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_checks_session (session_id, user_id),
  CONSTRAINT fk_checks_session FOREIGN KEY (session_id) REFERENCES event_sessions (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_amnesties (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  guild_id         VARCHAR(20)  NOT NULL,
  moderator_id     VARCHAR(20)  NOT NULL,
  user_id          VARCHAR(20)  NOT NULL,
  action           ENUM('remove_warn', 'remove_verification_warn', 'reset_verification', 'event_unban') NOT NULL,
  reason           VARCHAR(255) NULL,
  target_reference VARCHAR(64)  NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_amnesty_user (guild_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id      VARCHAR(20) NOT NULL,
  setting_key   VARCHAR(64) NOT NULL,
  setting_value TEXT         NULL,
  updated_by    VARCHAR(20)  NULL,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_reminders (
  guild_id         VARCHAR(20) NOT NULL,
  user_id          VARCHAR(20) NOT NULL,
  last_reminded_at DATETIME     NULL,
  opted_out_at     DATETIME     NULL,
  PRIMARY KEY (guild_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
