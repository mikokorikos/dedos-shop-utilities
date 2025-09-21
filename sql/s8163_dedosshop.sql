-- Improved relational schema for s8163_dedosshop
-- Generated on 2025-09-18T03:53:30.243542Z
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

DROP VIEW IF EXISTS `warns_summary`;
DROP TABLE IF EXISTS `warns`;
DROP TABLE IF EXISTS `guild_members`;
DROP TABLE IF EXISTS `discord_users`;
DROP TABLE IF EXISTS `discord_guilds`;

CREATE TABLE `discord_guilds` (
  `guild_id` varchar(32) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `icon_url` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`guild_id`),
  KEY `idx_guilds_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `discord_users` (
  `user_id` varchar(32) NOT NULL,
  `username` varchar(100) DEFAULT NULL,
  `global_name` varchar(100) DEFAULT NULL,
  `discriminator` smallint unsigned DEFAULT NULL,
  `avatar_url` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  KEY `idx_users_last_seen` (`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `guild_members` (
  `guild_id` varchar(32) NOT NULL,
  `user_id` varchar(32) NOT NULL,
  `first_seen_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` datetime DEFAULT NULL,
  `last_warn_at` datetime DEFAULT NULL,
  `nickname` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`guild_id`,`user_id`),
  KEY `idx_members_last_seen` (`guild_id`,`last_seen_at`),
  KEY `idx_members_last_warn` (`guild_id`,`last_warn_at`),
  CONSTRAINT `fk_members_guild` FOREIGN KEY (`guild_id`) REFERENCES `discord_guilds` (`guild_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_members_user` FOREIGN KEY (`user_id`) REFERENCES `discord_users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `warns` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `guild_id` varchar(32) NOT NULL,
  `user_id` varchar(32) NOT NULL,
  `moderator_id` varchar(32) DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `points` int NOT NULL DEFAULT 1,
  `policy_tag` varchar(64) DEFAULT NULL,
  `severity` enum('LOW','MEDIUM','HIGH') DEFAULT 'LOW',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime DEFAULT NULL,
  `context_message_url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_warns_guild_user_created_at` (`guild_id`,`user_id`,`created_at`,`id`),
  KEY `idx_warns_moderator` (`guild_id`,`moderator_id`,`created_at`),
  KEY `idx_warns_created` (`created_at`),
  CONSTRAINT `fk_warns_guild` FOREIGN KEY (`guild_id`) REFERENCES `discord_guilds` (`guild_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_warns_user` FOREIGN KEY (`user_id`) REFERENCES `discord_users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_warns_moderator` FOREIGN KEY (`moderator_id`) REFERENCES `discord_users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW `warns_summary` AS
SELECT
  w.guild_id,
  w.user_id,
  COUNT(*) AS total_warns,
  COALESCE(SUM(w.points), 0) AS total_points,
  MAX(w.created_at) AS last_warn_at
FROM warns w
GROUP BY w.guild_id, w.user_id;
