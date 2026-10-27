-- SkillBadge AI Database Schema for MySQL 8.0
CREATE DATABASE IF NOT EXISTS `skillbadge_ai` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `skillbadge_ai`;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Student Profiles Table
CREATE TABLE IF NOT EXISTS `student_profiles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL UNIQUE,
  `full_name` VARCHAR(150) NOT NULL,
  `college_name` VARCHAR(200) NOT NULL,
  `degree` VARCHAR(100) DEFAULT 'B.Tech / Bachelor of Science',
  `graduation_year` INT DEFAULT 2026,
  `department` VARCHAR(100) DEFAULT 'Computer Science',
  `bio` TEXT,
  `target_roles` JSON,
  `github_url` VARCHAR(255),
  `linkedin_url` VARCHAR(255),
  `portfolio_url` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_profile_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Experiences Table
CREATE TABLE IF NOT EXISTS `experiences` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `organization` VARCHAR(200),
  `role_title` VARCHAR(150),
  `start_date` DATE,
  `end_date` DATE,
  `is_current` BOOLEAN DEFAULT FALSE,
  `description` TEXT NOT NULL,
  `outcome_metrics` TEXT,
  `technologies_used` JSON,
  `evidence_url` VARCHAR(500),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_experience_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_exp_user` (`user_id`),
  INDEX `idx_exp_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Skills Table
CREATE TABLE IF NOT EXISTS `skills` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `category` ENUM(
    'Technical',
    'Tools & Frameworks',
    'Domain Knowledge',
    'Soft Skills & Leadership'
  ) NOT NULL,
  `score` INT NOT NULL DEFAULT 50,
  `proficiency_level` ENUM('Beginner', 'Intermediate', 'Advanced', 'Expert') NOT NULL DEFAULT 'Beginner',
  `evidence_count` INT NOT NULL DEFAULT 1,
  `last_evaluated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_skill_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `idx_user_skill_unique` (`user_id`, `name`),
  INDEX `idx_skill_score` (`score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Experience Skills Mapping Table (Evidence link)
CREATE TABLE IF NOT EXISTS `experience_skills` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `experience_id` INT NOT NULL,
  `skill_id` INT NOT NULL,
  `contribution_level` ENUM('Primary', 'Secondary', 'Supporting') DEFAULT 'Primary',
  `context_snippet` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_exp_skill_exp` FOREIGN KEY (`experience_id`) REFERENCES `experiences` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exp_skill_skill` FOREIGN KEY (`skill_id`) REFERENCES `skills` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `idx_exp_skill_unique` (`experience_id`, `skill_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Digital Badges Table
CREATE TABLE IF NOT EXISTS `digital_badges` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `badge_uuid` VARCHAR(64) NOT NULL UNIQUE,
  `title` VARCHAR(150) NOT NULL,
  `skill_category` VARCHAR(100) NOT NULL,
  `tier` ENUM('Bronze', 'Silver', 'Gold', 'Platinum') NOT NULL DEFAULT 'Bronze',
  `score` INT NOT NULL DEFAULT 50,
  `criteria_summary` TEXT NOT NULL,
  `evidence_summary` JSON,
  `issued_date` DATE NOT NULL,
  `verification_hash` VARCHAR(128) NOT NULL,
  `is_public` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_badge_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  INDEX `idx_badge_uuid` (`badge_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Career Artifacts Table (Resume bullets, LinkedIn summary, skill gaps)
CREATE TABLE IF NOT EXISTS `career_artifacts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `target_role` VARCHAR(150) NOT NULL,
  `linkedin_headline` TEXT,
  `linkedin_about` TEXT,
  `resume_summary` TEXT,
  `resume_bullets` JSON,
  `skill_gap_analysis` JSON,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_artifact_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `idx_user_artifact` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

