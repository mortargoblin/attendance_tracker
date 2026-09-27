-- =====================================================================
--  attendance_tracker - tietokannan luontiskripti
--  Johdettu ER-kaaviosta (ks. dokumentin luvut 3 ja 6)
--  Kohdealusta: MySQL 8.0 / MariaDB 10.6 tai uudempi
--  Merkistö: utf8mb4
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `attendance_tracker`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `attendance_tracker`;

-- Pudotetaan viiteavainriippuvuuksien käänteisessä järjestyksessä.
DROP TABLE IF EXISTS `attendances`;
DROP TABLE IF EXISTS `enrollments`;
DROP TABLE IF EXISTS `sessions`;
DROP TABLE IF EXISTS `courses`;
DROP TABLE IF EXISTS `users`;

-- ---------------------------------------------------------------------
-- users  <- yksilötyyppi KÄYTTÄJÄ
-- ---------------------------------------------------------------------
CREATE TABLE `users` (
  `user_id`       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(64)   NOT NULL,
  `email`         VARCHAR(255)  NOT NULL,
  `password_hash` CHAR(60)      NOT NULL  COMMENT 'bcrypt-tiiviste, 60 merkkiä',
  `first_name`    VARCHAR(80)   NOT NULL,
  `last_name`     VARCHAR(80)   NOT NULL,
  `role`          ENUM('STUDENT','TEACHER','ADMIN') NOT NULL DEFAULT 'STUDENT',
  `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_email`    (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- courses  <- yksilötyyppi KURSSI  (+ yhteystyyppi OPETTAA)
-- ---------------------------------------------------------------------
CREATE TABLE `courses` (
  `course_id`               INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `course_code`             VARCHAR(20)      NOT NULL,
  `name`                    VARCHAR(160)     NOT NULL,
  `description`             TEXT             NULL,
  `start_date`              DATE             NOT NULL,
  `end_date`                DATE             NOT NULL,
  `required_attendance_pct` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `teacher_id`              INT UNSIGNED     NOT NULL,
  PRIMARY KEY (`course_id`),
  UNIQUE KEY `uq_courses_code`     (`course_code`),
  KEY         `idx_courses_teacher`(`teacher_id`),
  CONSTRAINT `fk_courses_teacher`
    FOREIGN KEY (`teacher_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `chk_courses_dates` CHECK (`end_date` >= `start_date`),
  CONSTRAINT `chk_courses_pct`   CHECK (`required_attendance_pct` BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- sessions  <- heikko yksilötyyppi OPPITUNTI (+ yhteystyyppi KOOSTUU)
--   Tunnistava yhteys: (course_id, seq_no) on luonnollinen avain.
-- ---------------------------------------------------------------------
CREATE TABLE `sessions` (
  `session_id`      INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `course_id`       INT UNSIGNED     NOT NULL,
  `seq_no`          SMALLINT UNSIGNED NOT NULL COMMENT 'oppitunnin järjestysnumero kurssilla',
  `topic`           VARCHAR(160)     NULL,
  `starts_at`       DATETIME         NOT NULL,
  `ends_at`         DATETIME         NOT NULL,
  `room`            VARCHAR(40)      NULL,
  `attendance_code` VARCHAR(10)      NULL COMMENT 'kertakohtainen kirjautumiskoodi',
  `code_expires_at` DATETIME         NULL,
  PRIMARY KEY (`session_id`),
  UNIQUE KEY `uq_sessions_course_seq` (`course_id`, `seq_no`),
  KEY         `idx_sessions_starts_at`(`starts_at`),
  CONSTRAINT `fk_sessions_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `chk_sessions_time` CHECK (`ends_at` > `starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- enrollments  <- yhteystyyppi ILMOITTAUTUU (M:N -> oma taulu)
-- ---------------------------------------------------------------------
CREATE TABLE `enrollments` (
  `enrollment_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`    INT UNSIGNED NOT NULL,
  `course_id`     INT UNSIGNED NOT NULL,
  `enrolled_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status`        ENUM('ACTIVE','COMPLETED','DROPPED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`enrollment_id`),
  UNIQUE KEY `uq_enrollments_student_course` (`student_id`, `course_id`),
  KEY         `idx_enrollments_course`       (`course_id`),
  CONSTRAINT `fk_enrollments_student`
    FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_enrollments_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- attendances  <- yhteystyyppi OSALLISTUU (M:N -> oma taulu)
--   Yksi rivi = yhden opiskelijan läsnäolotieto yhdellä oppitunnilla.
-- ---------------------------------------------------------------------
CREATE TABLE `attendances` (
  `attendance_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id`    INT UNSIGNED NOT NULL,
  `student_id`    INT UNSIGNED NOT NULL,
  `status`        ENUM('PRESENT','LATE','ABSENT','EXCUSED') NOT NULL DEFAULT 'ABSENT',
  `marked_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `marked_via`    ENUM('CODE','TEACHER','IMPORT') NOT NULL DEFAULT 'TEACHER',
  PRIMARY KEY (`attendance_id`),
  UNIQUE KEY `uq_attendances_session_student` (`session_id`, `student_id`),
  KEY         `idx_attendances_student`       (`student_id`),
  CONSTRAINT `fk_attendances_session`
    FOREIGN KEY (`session_id`) REFERENCES `sessions` (`session_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_attendances_student`
    FOREIGN KEY (`student_id`) REFERENCES `users` (`user_id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  MALLIDATA
-- =====================================================================
INSERT INTO `users`
  (`user_id`, `username`, `email`, `password_hash`, `first_name`, `last_name`, `role`, `created_at`)
VALUES
  (1, 'tvirtanen', 'tiina.virtanen@example.edu', '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Tiina', 'Virtanen', 'TEACHER', '2026-08-11 09:02:14'),
  (2, 'mlaine', 'mikko.laine@example.edu', '$2y$10$Kq3tYr8ZvWpLmNaCdEfGhOuXsTvBnMqLpRzYwEaDcFgHiJkLmNoPq', 'Mikko', 'Laine', 'TEACHER', '2026-08-11 09:05:51'),
  (3, 'akorhonen', 'anni.korhonen@example.edu', '$2y$10$Ab7cDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ', 'Anni', 'Korhonen', 'STUDENT', '2026-08-18 12:44:03'),
  (4, 'jnieminen', 'joonas.nieminen@example.edu', '$2y$10$Lm4nOpQrStUvWxYzAbCdEeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJ', 'Joonas', 'Nieminen', 'STUDENT', '2026-08-18 13:01:37'),
  (5, 'srantala', 'sofia.rantala@example.edu', '$2y$10$Bv7wXyZaBcDeFgHiJkLmNeOpQrStUvWxYzAbCdEfGhIjKlMnOpQrS', 'Sofia', 'Rantala', 'STUDENT', '2026-08-19 08:22:10'),
  (6, 'psalo', 'pekka.salo@example.edu', '$2y$10$Ty2zAbCdEfGhIjKlMnOpQeRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuV', 'Pekka', 'Salo', 'ADMIN', '2026-08-01 07:30:00');

INSERT INTO `courses`
  (`course_id`, `course_code`, `name`, `description`, `start_date`, `end_date`, `required_attendance_pct`, `teacher_id`)
VALUES
  (1, 'TX00EY01', 'Ohjelmistotuotantoprojekti 1', 'Tiimiprojekti, jossa toteutetaan ohjelmisto oikealle asiakkaalle.', '2026-09-01', '2026-12-18', 75, 1),
  (2, 'TX00CT10', 'Tietokannat ja tiedonhallinta', 'Relaatiomallinnus, SQL ja tietokantasuunnittelun perusteet.', '2026-09-01', '2026-10-23', 80, 2),
  (3, 'TX00DE55', 'Web-palvelinohjelmointi', 'Palvelinpuolen sovelluskehitys ja REST-rajapinnat.', '2026-10-27', '2026-12-18', 70, 1);

INSERT INTO `sessions`
  (`session_id`, `course_id`, `seq_no`, `topic`, `starts_at`, `ends_at`, `room`, `attendance_code`, `code_expires_at`)
VALUES
  (1, 1, 1, 'Projektin aloitus ja tiimiytyminen', '2026-09-02 09:00:00', '2026-09-02 11:30:00', 'MPA5001', '7QK2AF', '2026-09-02 09:15:00'),
  (2, 1, 2, 'Vaatimusmäärittely', '2026-09-09 09:00:00', '2026-09-09 11:30:00', 'MPA5001', NULL, NULL),
  (3, 1, 3, 'Sprint 1 -katselmointi', '2026-09-16 09:00:00', '2026-09-16 11:30:00', 'MPA5001', 'B3ZX91', '2026-09-16 09:10:00'),
  (4, 2, 1, 'ER-mallinnus', '2026-09-03 13:00:00', '2026-09-03 15:30:00', 'MPA4012', 'XK77QP', '2026-09-03 13:15:00'),
  (5, 2, 2, 'Normalisointi', '2026-09-10 13:00:00', '2026-09-10 15:30:00', 'MPA4012', NULL, NULL);

INSERT INTO `enrollments`
  (`enrollment_id`, `student_id`, `course_id`, `enrolled_at`, `status`)
VALUES
  (1, 3, 1, '2026-08-20 10:12:00', 'ACTIVE'),
  (2, 4, 1, '2026-08-20 10:31:00', 'ACTIVE'),
  (3, 5, 1, '2026-08-21 09:05:00', 'DROPPED'),
  (4, 3, 2, '2026-08-20 10:14:00', 'ACTIVE'),
  (5, 4, 2, '2026-08-22 15:47:00', 'COMPLETED'),
  (6, 3, 3, '2026-08-25 11:02:00', 'ACTIVE'),
  (7, 5, 3, '2026-08-25 11:20:00', 'ACTIVE');

INSERT INTO `attendances`
  (`attendance_id`, `session_id`, `student_id`, `status`, `marked_at`, `marked_via`)
VALUES
  (1, 1, 3, 'PRESENT', '2026-09-02 09:03:12', 'CODE'),
  (2, 1, 4, 'PRESENT', '2026-09-02 09:07:45', 'CODE'),
  (3, 1, 5, 'ABSENT', '2026-09-02 11:35:00', 'TEACHER'),
  (4, 2, 3, 'PRESENT', '2026-09-09 09:02:55', 'TEACHER'),
  (5, 2, 4, 'LATE', '2026-09-09 09:24:10', 'TEACHER'),
  (6, 3, 3, 'EXCUSED', '2026-09-16 08:40:00', 'TEACHER'),
  (7, 3, 4, 'PRESENT', '2026-09-16 09:05:33', 'CODE'),
  (8, 4, 3, 'PRESENT', '2026-09-03 13:04:08', 'CODE'),
  (9, 4, 4, 'ABSENT', '2026-09-03 15:35:00', 'TEACHER'),
  (10, 5, 3, 'PRESENT', '2026-09-10 13:01:47', 'TEACHER');

-- ---------------------------------------------------------------------
-- Näkymä: läsnäoloprosentti kurssi- ja opiskelijakohtaisesti.
-- Tätä sovellus kysyy, kun se näyttää täyttyykö läsnäolovaatimus.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_attendance_summary` AS
SELECT
    c.`course_id`,
    c.`course_code`,
    u.`user_id`                                   AS `student_id`,
    CONCAT(u.`first_name`, ' ', u.`last_name`)    AS `student_name`,
    COUNT(s.`session_id`)                         AS `sessions_total`,
    COALESCE(SUM(a.`status` IN ('PRESENT','LATE','EXCUSED')), 0) AS `sessions_ok`,
    ROUND(100 * COALESCE(SUM(a.`status` IN ('PRESENT','LATE','EXCUSED')), 0)
          / NULLIF(COUNT(s.`session_id`), 0), 1)  AS `attendance_pct`,
    c.`required_attendance_pct`
FROM `enrollments` e
JOIN `users`    u ON u.`user_id`   = e.`student_id`
JOIN `courses`  c ON c.`course_id` = e.`course_id`
LEFT JOIN `sessions` s ON s.`course_id` = c.`course_id`
LEFT JOIN `attendances` a
       ON a.`session_id` = s.`session_id`
      AND a.`student_id` = e.`student_id`
WHERE e.`status` <> 'DROPPED'
GROUP BY c.`course_id`, c.`course_code`, u.`user_id`,
         u.`first_name`, u.`last_name`, c.`required_attendance_pct`;
