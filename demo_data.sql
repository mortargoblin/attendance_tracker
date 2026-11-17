-- Demo data for local testing. Loaded by docker compose after attendance_tracker_v2.sql
-- (only on a fresh database volume: run `docker compose down -v` first to reload it).
--
-- Teacher login:  teacher@example.com / password123
-- Student logins: <firstname>.<lastname>@example.com / password123   (e.g. aino.virtanen@example.com)

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
-- utf8mb4 on the client side too, so the non-Latin names below arrive intact
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `attendance_tracker`;

SET @pw = '$2y$10$Cso6qck5bpJS1XdgAWngcu2i5etMDk9TtoF2YGg5tH8Yd7gsi2ifO';

INSERT INTO `users` (`username`, `email`, `password_hash`, `first_name`, `last_name`, `role`)
VALUES ('demoteacher', 'teacher@example.com', @pw, 'Demo', 'Teacher', 'TEACHER');

-- 10 first names x 10 last names = 100 students
INSERT INTO `users` (`username`, `email`, `password_hash`, `first_name`, `last_name`, `role`)
SELECT LOWER(CONCAT(f.n, '.', l.n)), LOWER(CONCAT(f.n, '.', l.n, '@example.com')), @pw, f.n, l.n, 'STUDENT'
FROM (SELECT 'Aino' AS n UNION ALL SELECT 'Eino' UNION ALL SELECT 'Helmi' UNION ALL SELECT 'Onni'
      UNION ALL SELECT 'Venla' UNION ALL SELECT 'Elias' UNION ALL SELECT 'Aada' UNION ALL SELECT 'Leevi'
      UNION ALL SELECT 'Ilona' UNION ALL SELECT 'Oskari') f
CROSS JOIN
     (SELECT 'Virtanen' AS n UNION ALL SELECT 'Heikkinen' UNION ALL SELECT 'Mäkinen' UNION ALL SELECT 'Hämäläinen'
      UNION ALL SELECT 'Koskinen' UNION ALL SELECT 'Lehtonen' UNION ALL SELECT 'Järvinen' UNION ALL SELECT 'Saarinen'
      UNION ALL SELECT 'Mattila' UNION ALL SELECT 'Kinnunen') l;

-- Students with non-Latin names, to check that names in every UI script are stored and shown
-- correctly (Cyrillic, Japanese, Persian/RTL). Same password as above.
INSERT INTO `users` (`username`, `email`, `password_hash`, `first_name`, `last_name`, `role`)
VALUES ('ivan.petrov',     'ivan.petrov@example.com',     @pw, 'Иван',    'Петров',   'STUDENT'),
       ('yamada.taro',     'yamada.taro@example.com',     @pw, '太郎',     '山田',     'STUDENT'),
       ('sara.mohammadi',  'sara.mohammadi@example.com',  @pw, 'سارا',    'محمدی',    'STUDENT'),
       ('bat-erdene.dorj', 'bat-erdene.dorj@example.com', @pw, 'Бат-Эрдэнэ', 'Дорж',  'STUDENT');
