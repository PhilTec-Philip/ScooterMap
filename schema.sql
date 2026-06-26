CREATE DATABASE IF NOT EXISTS scootermap
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_uca1400_ai_ci;

USE scootermap;

CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(36) NOT NULL,
  category VARCHAR(32) NOT NULL,
  type VARCHAR(80) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  duration VARCHAR(16) NOT NULL,
  description TEXT NOT NULL,
  geometry JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmations INT UNSIGNED NOT NULL DEFAULT 0,
  disputes INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_reports_category (category),
  INDEX idx_reports_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE IF NOT EXISTS report_votes (
  report_id VARCHAR(36) NOT NULL,
  voter_id VARCHAR(64) NOT NULL,
  vote_type ENUM('confirmations', 'disputes') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (report_id, voter_id),
  CONSTRAINT fk_report_votes_report
    FOREIGN KEY (report_id) REFERENCES reports(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
