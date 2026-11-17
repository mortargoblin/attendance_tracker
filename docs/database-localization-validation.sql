-- =====================================================================
--  Validation queries for database localization (Sprint 6).
--  Run after attendance_tracker_v2.sql, database_localization.sql and
--  demo_data.sql:
--
--    mariadb --default-character-set=utf8mb4 -t attendance_tracker < docs/database-localization-validation.sql
--
--  Expected results are written next to each check; the actual output of a
--  run is in docs/database-localization.md (section "Validation results").
-- =====================================================================
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `attendance_tracker`;

-- V1  Connection character set. Expect utf8mb4 for client, connection and results.
SELECT 'V1 connection charset' AS `check`,
       @@character_set_client     AS client,
       @@character_set_connection AS connection,
       @@character_set_results    AS results,
       @@collation_connection     AS collation;

-- V2  Database default charset. Expect utf8mb4 / utf8mb4_unicode_ci.
SELECT 'V2 database charset' AS `check`, default_character_set_name, default_collation_name
FROM information_schema.schemata WHERE schema_name = 'attendance_tracker';

-- V3  Every text column is utf8mb4. Expect 0 rows.
SELECT 'V3 non-utf8mb4 column' AS `check`, table_name, column_name, character_set_name
FROM information_schema.columns
WHERE table_schema = 'attendance_tracker'
  AND character_set_name IS NOT NULL
  AND character_set_name <> 'utf8mb4';

-- V4  Multi-byte text is stored intact: CHAR_LENGTH counts characters,
--     OCTET_LENGTH counts bytes. Expect bytes > chars for non-Latin text
--     (2 bytes/char for Cyrillic and Persian, 3 for Japanese).
SELECT 'V4 byte vs char length' AS `check`, lang_code, name,
       CHAR_LENGTH(name) AS chars, OCTET_LENGTH(name) AS bytes
FROM course_translations WHERE course_id = 1 ORDER BY lang_code;

-- V5  4-byte characters (emoji, outside the BMP) round-trip: this fails on
--     the legacy 3-byte "utf8" charset. Expect the same string back, 4 bytes.
CREATE TEMPORARY TABLE v5 (txt VARCHAR(20)) DEFAULT CHARSET = utf8mb4;
INSERT INTO v5 VALUES ('✅📚');
SELECT 'V5 4-byte round trip' AS `check`, txt, CHAR_LENGTH(txt) AS chars, OCTET_LENGTH(txt) AS bytes, HEX(txt) AS hex FROM v5;
DROP TEMPORARY TABLE v5;

-- V6  Retrieval in every supported language with fallback. Expect one row
--     per language; course 3 has no fa/fi/mn translation, so it falls back
--     to the original Finnish name with is_translated = 0.
SELECT 'V6 course 3 per language' AS `check`, v.lang_code, l.text_direction, v.name, v.is_translated
FROM v_courses_i18n v JOIN languages l USING (lang_code)
WHERE v.course_id = 3 ORDER BY l.sort_order;

-- V7  Translation coverage per language (content tables). Expect 6 rows;
--     the numbers show how much falls back to the original text.
SELECT 'V7 coverage' AS `check`, l.lang_code,
       (SELECT COUNT(*) FROM course_translations ct WHERE ct.lang_code = l.lang_code)  AS courses_translated,
       (SELECT COUNT(*) FROM courses)                                                AS courses_total,
       (SELECT COUNT(*) FROM session_translations st WHERE st.lang_code = l.lang_code) AS sessions_translated,
       (SELECT COUNT(*) FROM sessions)                                               AS sessions_total
FROM languages l ORDER BY l.sort_order;

-- V8  Every ENUM value has a label in every language. Expect 0 rows.
SELECT 'V8 missing enum label' AS `check`, e.enum_type, e.enum_value, l.lang_code
FROM (SELECT DISTINCT enum_type, enum_value FROM enum_translations) e
CROSS JOIN languages l
LEFT JOIN enum_translations t
       ON t.enum_type = e.enum_type AND t.enum_value = e.enum_value AND t.lang_code = l.lang_code
WHERE t.label IS NULL;

-- V9  Localized attendance status for one student in the RTL language and
--     in Japanese. Expect Persian / Japanese labels next to the raw code.
SELECT 'V9 status labels' AS `check`, lang_code, session_id, status, status_label, status_short
FROM v_attendance_i18n WHERE student_id = 3 AND lang_code IN ('fa', 'ja')
ORDER BY lang_code, session_id;

-- V10 Exactly one default (fallback) language. Expect 1.
SELECT 'V10 default languages' AS `check`, COUNT(*) AS defaults FROM languages WHERE is_default;

-- V11 Non-Latin user names (demo_data.sql) are searchable the way the
--     backend's student search does it (LIKE on CONCAT(first, ' ', last)).
--     Expect Иван Петров for 'Петр' and 山田 for '山田'.
SELECT 'V11 search non-Latin' AS `check`, q.term, CONCAT(u.first_name, ' ', u.last_name) AS name, u.email
FROM (SELECT 'Петр' AS term UNION ALL SELECT '山田' UNION ALL SELECT 'محمد') q
JOIN users u ON CONCAT(u.first_name, ' ', u.last_name) LIKE CONCAT('%', q.term, '%')
ORDER BY q.term;

-- V12 Locale-aware sorting. utf8mb4_unicode_ci sorts Ä/Ö as A/O; the
--     Finnish (Swedish) collation named in languages.collation_name puts
--     them after Z, as a Finnish reader expects.
--     Expect: Ahonen < Äijälä < Öhman < Zetterberg   (unicode_ci)
--             Ahonen < Zetterberg < Äijälä < Öhman   (swedish_ci)
SELECT 'V12 sort unicode_ci' AS `check`, GROUP_CONCAT(n ORDER BY n COLLATE utf8mb4_unicode_ci SEPARATOR ' < ') AS sorted
FROM (SELECT 'Öhman' AS n UNION ALL SELECT 'Ahonen' UNION ALL SELECT 'Zetterberg' UNION ALL SELECT 'Äijälä') x
UNION ALL
SELECT 'V12 sort swedish_ci (fi)', GROUP_CONCAT(n ORDER BY n COLLATE utf8mb4_swedish_ci SEPARATOR ' < ')
FROM (SELECT 'Öhman' AS n UNION ALL SELECT 'Ahonen' UNION ALL SELECT 'Zetterberg' UNION ALL SELECT 'Äijälä') x;
