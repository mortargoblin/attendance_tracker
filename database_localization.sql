-- =====================================================================
--  attendance_tracker - database localization (Sprint 6)
--
--  Additive migration: run it AFTER attendance_tracker_v2.sql. It does not
--  change any existing table, so the backend keeps working unchanged.
--
--  Method: "translation tables" (one row per entity per language) with a
--  fallback to the original column. See docs/database-localization.md.
--
--    languages                 the supported locales (same six as the UI)
--    course_translations       name / description of a course per language
--    session_translations      topic of a session per language
--    enum_translations         display labels for ENUM values (status, role ...)
--    v_courses_i18n            every course x every language, with fallback
--    v_sessions_i18n           every session x every language, with fallback
--    v_attendance_i18n         attendance rows with localized status labels
--
--  Target: MariaDB 10.6+ / MySQL 8.0, character set utf8mb4.
-- =====================================================================

-- The client connection must be utf8mb4 too, otherwise non-Latin literals
-- below would be mangled on the way in (mysql CLI defaults vary by distro).
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `attendance_tracker`;

DROP VIEW  IF EXISTS `v_attendance_i18n`;
DROP VIEW  IF EXISTS `v_sessions_i18n`;
DROP VIEW  IF EXISTS `v_courses_i18n`;
DROP TABLE IF EXISTS `enum_translations`;
DROP TABLE IF EXISTS `session_translations`;
DROP TABLE IF EXISTS `course_translations`;
DROP TABLE IF EXISTS `languages`;

-- ---------------------------------------------------------------------
-- languages: the locales content can be stored in.
--   lang_code is a BCP 47 language tag, the same codes the frontend uses
--   (client/js/i18n.js LANGUAGES) so the UI language maps 1:1 to a row.
-- ---------------------------------------------------------------------
CREATE TABLE `languages` (
  `lang_code`      VARCHAR(10)  NOT NULL COMMENT 'BCP 47 tag, e.g. en, fi, fa',
  `native_name`    VARCHAR(40)  NOT NULL COMMENT 'name of the language in itself',
  `english_name`   VARCHAR(40)  NOT NULL,
  `text_direction` ENUM('LTR','RTL') NOT NULL DEFAULT 'LTR',
  `collation_name` VARCHAR(64)  NOT NULL DEFAULT 'utf8mb4_unicode_ci'
                   COMMENT 'collation to use with COLLATE when sorting text in this language',
  `is_default`     BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'exactly one row: the fallback language',
  `sort_order`     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`lang_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `languages`
  (`lang_code`, `native_name`, `english_name`, `text_direction`, `collation_name`, `is_default`, `sort_order`)
VALUES
  ('en', 'English', 'English',   'LTR', 'utf8mb4_unicode_ci', TRUE,  1),
  ('fi', 'Suomi',   'Finnish',   'LTR', 'utf8mb4_swedish_ci', FALSE, 2),  -- Finnish uses the Swedish sort rules (å ä ö after z)
  ('fa', 'فارسی',   'Persian',   'RTL', 'utf8mb4_persian_ci', FALSE, 3),
  ('ja', '日本語',   'Japanese',  'LTR', 'utf8mb4_unicode_ci', FALSE, 4),
  ('ru', 'Русский', 'Russian',   'LTR', 'utf8mb4_unicode_ci', FALSE, 5),
  ('mn', 'Монгол',  'Mongolian', 'LTR', 'utf8mb4_unicode_ci', FALSE, 6);

-- ---------------------------------------------------------------------
-- course_translations: a course's name and description in one language.
--   courses.name / courses.description stay the original text the teacher
--   typed; a translation row overrides it for that language only.
-- ---------------------------------------------------------------------
CREATE TABLE `course_translations` (
  `course_id`   INT UNSIGNED NOT NULL,
  `lang_code`   VARCHAR(10)  NOT NULL,
  `name`        VARCHAR(160) NOT NULL,
  `description` TEXT         NULL,
  PRIMARY KEY (`course_id`, `lang_code`),
  KEY `idx_course_translations_lang` (`lang_code`),
  CONSTRAINT `fk_course_translations_course`
    FOREIGN KEY (`course_id`) REFERENCES `courses` (`course_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_course_translations_lang`
    FOREIGN KEY (`lang_code`) REFERENCES `languages` (`lang_code`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- session_translations: a session's topic in one language.
-- ---------------------------------------------------------------------
CREATE TABLE `session_translations` (
  `session_id` INT UNSIGNED NOT NULL,
  `lang_code`  VARCHAR(10)  NOT NULL,
  `topic`      VARCHAR(160) NOT NULL,
  PRIMARY KEY (`session_id`, `lang_code`),
  KEY `idx_session_translations_lang` (`lang_code`),
  CONSTRAINT `fk_session_translations_session`
    FOREIGN KEY (`session_id`) REFERENCES `sessions` (`session_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_session_translations_lang`
    FOREIGN KEY (`lang_code`) REFERENCES `languages` (`lang_code`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- enum_translations: labels for the fixed ENUM values the schema stores.
--   The database keeps language-neutral codes ('PRESENT', 'TEACHER' ...);
--   only their display text is translated. The labels match the
--   status.* / register.role* keys in client/locales/*.json.
--   enum_type names the column: attendances.status, enrollments.status,
--   users.role, attendances.marked_via.
-- ---------------------------------------------------------------------
CREATE TABLE `enum_translations` (
  `enum_type`   VARCHAR(40)  NOT NULL,
  `enum_value`  VARCHAR(20)  NOT NULL,
  `lang_code`   VARCHAR(10)  NOT NULL,
  `label`       VARCHAR(80)  NOT NULL,
  `short_label` VARCHAR(8)   NULL COMMENT 'one-character form for dense tables',
  PRIMARY KEY (`enum_type`, `enum_value`, `lang_code`),
  KEY `idx_enum_translations_lang` (`lang_code`),
  CONSTRAINT `fk_enum_translations_lang`
    FOREIGN KEY (`lang_code`) REFERENCES `languages` (`lang_code`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `enum_translations` (`enum_type`, `enum_value`, `lang_code`, `label`, `short_label`) VALUES
  -- attendances.status
  ('attendances.status', 'PRESENT', 'en', 'Present',              '✓'),
  ('attendances.status', 'LATE',    'en', 'Late',                 'L'),
  ('attendances.status', 'ABSENT',  'en', 'Absent',               '✗'),
  ('attendances.status', 'EXCUSED', 'en', 'Excused',              'E'),
  ('attendances.status', 'PRESENT', 'fi', 'Läsnä',                '✓'),
  ('attendances.status', 'LATE',    'fi', 'Myöhässä',             'M'),
  ('attendances.status', 'ABSENT',  'fi', 'Poissa',               '✗'),
  ('attendances.status', 'EXCUSED', 'fi', 'Poissa luvalla',       'L'),
  ('attendances.status', 'PRESENT', 'fa', 'حاضر',                 'ح'),
  ('attendances.status', 'LATE',    'fa', 'تأخیر',                'ت'),
  ('attendances.status', 'ABSENT',  'fa', 'غایب',                 'غ'),
  ('attendances.status', 'EXCUSED', 'fa', 'غیبت موجه',            'م'),
  ('attendances.status', 'PRESENT', 'ja', '出席',                 '出'),
  ('attendances.status', 'LATE',    'ja', '遅刻',                 '遅'),
  ('attendances.status', 'ABSENT',  'ja', '欠席',                 '欠'),
  ('attendances.status', 'EXCUSED', 'ja', '公欠',                 '公'),
  ('attendances.status', 'PRESENT', 'ru', 'Присутствовал',        '✓'),
  ('attendances.status', 'LATE',    'ru', 'Опоздал',              'О'),
  ('attendances.status', 'ABSENT',  'ru', 'Отсутствовал',         '✗'),
  ('attendances.status', 'EXCUSED', 'ru', 'Уважительная причина', 'У'),
  ('attendances.status', 'PRESENT', 'mn', 'Ирсэн',                '✓'),
  ('attendances.status', 'LATE',    'mn', 'Хоцорсон',             'Х'),
  ('attendances.status', 'ABSENT',  'mn', 'Тасалсан',             '✗'),
  ('attendances.status', 'EXCUSED', 'mn', 'Чөлөөтэй',             'Ч'),
  -- users.role
  ('users.role', 'STUDENT', 'en', 'Student',       NULL),
  ('users.role', 'TEACHER', 'en', 'Teacher',       NULL),
  ('users.role', 'ADMIN',   'en', 'Administrator', NULL),
  ('users.role', 'STUDENT', 'fi', 'Opiskelija',    NULL),
  ('users.role', 'TEACHER', 'fi', 'Opettaja',      NULL),
  ('users.role', 'ADMIN',   'fi', 'Ylläpitäjä',    NULL),
  ('users.role', 'STUDENT', 'fa', 'دانشجو',        NULL),
  ('users.role', 'TEACHER', 'fa', 'استاد',         NULL),
  ('users.role', 'ADMIN',   'fa', 'مدیر سیستم',    NULL),
  ('users.role', 'STUDENT', 'ja', '学生',          NULL),
  ('users.role', 'TEACHER', 'ja', '教員',          NULL),
  ('users.role', 'ADMIN',   'ja', '管理者',        NULL),
  ('users.role', 'STUDENT', 'ru', 'Студент',       NULL),
  ('users.role', 'TEACHER', 'ru', 'Преподаватель', NULL),
  ('users.role', 'ADMIN',   'ru', 'Администратор', NULL),
  ('users.role', 'STUDENT', 'mn', 'Оюутан',        NULL),
  ('users.role', 'TEACHER', 'mn', 'Багш',          NULL),
  ('users.role', 'ADMIN',   'mn', 'Админ',         NULL),
  -- enrollments.status
  ('enrollments.status', 'ACTIVE',    'en', 'Active',     NULL),
  ('enrollments.status', 'COMPLETED', 'en', 'Completed',  NULL),
  ('enrollments.status', 'DROPPED',   'en', 'Dropped',    NULL),
  ('enrollments.status', 'ACTIVE',    'fi', 'Aktiivinen', NULL),
  ('enrollments.status', 'COMPLETED', 'fi', 'Suoritettu', NULL),
  ('enrollments.status', 'DROPPED',   'fi', 'Keskeytetty', NULL),
  ('enrollments.status', 'ACTIVE',    'fa', 'فعال',       NULL),
  ('enrollments.status', 'COMPLETED', 'fa', 'گذرانده',    NULL),
  ('enrollments.status', 'DROPPED',   'fa', 'انصراف',     NULL),
  ('enrollments.status', 'ACTIVE',    'ja', '受講中',     NULL),
  ('enrollments.status', 'COMPLETED', 'ja', '修了',       NULL),
  ('enrollments.status', 'DROPPED',   'ja', '取り消し',   NULL),
  ('enrollments.status', 'ACTIVE',    'ru', 'Активен',    NULL),
  ('enrollments.status', 'COMPLETED', 'ru', 'Завершён',   NULL),
  ('enrollments.status', 'DROPPED',   'ru', 'Отчислен',   NULL),
  ('enrollments.status', 'ACTIVE',    'mn', 'Идэвхтэй',   NULL),
  ('enrollments.status', 'COMPLETED', 'mn', 'Дууссан',    NULL),
  ('enrollments.status', 'DROPPED',   'mn', 'Гарсан',     NULL);

-- ---------------------------------------------------------------------
-- Sample translations for the sample courses/sessions in
-- attendance_tracker_v2.sql (their original text is Finnish). Not every
-- session is translated into every language on purpose: the missing ones
-- exercise the fallback. Translations are first drafts, like the UI ones.
-- INSERT ... SELECT skips rows whose course/session does not exist, so the
-- script also runs on a database without the sample data.
-- ---------------------------------------------------------------------
INSERT INTO `course_translations` (`course_id`, `lang_code`, `name`, `description`)
SELECT t.course_id, t.lang_code, t.name, t.description
FROM (
  SELECT 1 AS course_id, 'en' AS lang_code, 'Software Engineering Project 1' AS name, 'A team project that builds software for a real client.' AS description
  UNION ALL SELECT 1, 'fa', 'پروژه مهندسی نرم‌افزار ۱', 'پروژه‌ای تیمی برای ساخت نرم‌افزار برای یک مشتری واقعی.'
  UNION ALL SELECT 1, 'ja', 'ソフトウェア開発プロジェクト1', '実際の顧客のためにソフトウェアを開発するチームプロジェクト。'
  UNION ALL SELECT 1, 'ru', 'Проект по разработке ПО 1', 'Командный проект по созданию программы для реального заказчика.'
  UNION ALL SELECT 1, 'mn', 'Програм хангамжийн төсөл 1', 'Бодит захиалагчид зориулан програм бүтээх багийн төсөл.'
  UNION ALL SELECT 2, 'en', 'Databases and Data Management', 'Relational modelling, SQL and the basics of database design.'
  UNION ALL SELECT 2, 'fa', 'پایگاه داده و مدیریت داده', 'مدل‌سازی رابطه‌ای، SQL و مبانی طراحی پایگاه داده.'
  UNION ALL SELECT 2, 'ja', 'データベースとデータ管理', 'リレーショナルモデリング、SQL、データベース設計の基礎。'
  UNION ALL SELECT 2, 'ru', 'Базы данных и управление данными', 'Реляционное моделирование, SQL и основы проектирования баз данных.'
  UNION ALL SELECT 2, 'mn', 'Өгөгдлийн сан ба өгөгдлийн менежмент', 'Харилцааны загварчлал, SQL ба өгөгдлийн сангийн зохиомжийн үндэс.'
  UNION ALL SELECT 3, 'en', 'Web Server Programming', 'Server-side application development and REST APIs.'
  UNION ALL SELECT 3, 'ja', 'Webサーバープログラミング', 'サーバーサイドのアプリケーション開発とREST API。'
  UNION ALL SELECT 3, 'ru', 'Серверное веб-программирование', 'Разработка серверных приложений и REST API.'
) t
JOIN `courses` c ON c.`course_id` = t.course_id;

INSERT INTO `session_translations` (`session_id`, `lang_code`, `topic`)
SELECT t.session_id, t.lang_code, t.topic
FROM (
  SELECT 1 AS session_id, 'en' AS lang_code, 'Project kick-off and team building' AS topic
  UNION ALL SELECT 1, 'ja', 'プロジェクト開始とチームづくり'
  UNION ALL SELECT 1, 'ru', 'Старт проекта и формирование команды'
  UNION ALL SELECT 1, 'fa', 'آغاز پروژه و تیم‌سازی'
  UNION ALL SELECT 2, 'en', 'Requirements specification'
  UNION ALL SELECT 2, 'ja', '要件定義'
  UNION ALL SELECT 3, 'en', 'Sprint 1 review'
  UNION ALL SELECT 4, 'en', 'ER modelling'
  UNION ALL SELECT 4, 'mn', 'ER загварчлал'
  UNION ALL SELECT 5, 'en', 'Normalisation'
) t
JOIN `sessions` s ON s.`session_id` = t.session_id;

-- ---------------------------------------------------------------------
-- Retrieval views. Every row exists for every language; is_translated
-- tells whether a translation was found or the original text is shown.
-- Query them with  WHERE lang_code = ?  (the UI language).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_courses_i18n` AS
SELECT
    c.`course_id`,
    l.`lang_code`,
    COALESCE(ct.`name`, c.`name`)               AS `name`,
    COALESCE(ct.`description`, c.`description`) AS `description`,
    (ct.`course_id` IS NOT NULL)                AS `is_translated`,
    c.`teacher_id`
FROM `courses` c
CROSS JOIN `languages` l
LEFT JOIN `course_translations` ct
       ON ct.`course_id` = c.`course_id`
      AND ct.`lang_code` = l.`lang_code`;

CREATE OR REPLACE VIEW `v_sessions_i18n` AS
SELECT
    s.`session_id`,
    s.`course_id`,
    s.`seq_no`,
    l.`lang_code`,
    COALESCE(st.`topic`, s.`topic`) AS `topic`,
    (st.`session_id` IS NOT NULL)   AS `is_translated`,
    s.`starts_at`
FROM `sessions` s
CROSS JOIN `languages` l
LEFT JOIN `session_translations` st
       ON st.`session_id` = s.`session_id`
      AND st.`lang_code`  = l.`lang_code`;

-- Status labels fall back to the default language (English), then to the
-- raw ENUM code, so a missing label is visible instead of blank.
CREATE OR REPLACE VIEW `v_attendance_i18n` AS
SELECT
    a.`attendance_id`,
    a.`session_id`,
    a.`student_id`,
    l.`lang_code`,
    a.`status`,
    COALESCE(et.`label`, def.`label`, a.`status`)   AS `status_label`,
    COALESCE(et.`short_label`, def.`short_label`)   AS `status_short`,
    a.`marked_at`
FROM `attendances` a
CROSS JOIN `languages` l
LEFT JOIN `enum_translations` et
       ON et.`enum_type`  = 'attendances.status'
      AND et.`enum_value` = a.`status`
      AND et.`lang_code`  = l.`lang_code`
LEFT JOIN `languages` dl
       ON dl.`is_default`
LEFT JOIN `enum_translations` def
       ON def.`enum_type`  = 'attendances.status'
      AND def.`enum_value` = a.`status`
      AND def.`lang_code`  = dl.`lang_code`;
