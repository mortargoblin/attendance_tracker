-- The tables from attendance_tracker_v2.sql, trimmed to syntax H2 understands, for ApiTest.
-- Keep the column names, types and constraints in step with that file.

CREATE TABLE users (
  user_id       INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash CHAR(60)     NOT NULL,
  first_name    VARCHAR(80)  NOT NULL,
  last_name     VARCHAR(80)  NOT NULL,
  role          ENUM('STUDENT','TEACHER','ADMIN') NOT NULL DEFAULT 'STUDENT',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE courses (
  course_id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course_code             VARCHAR(20)  NOT NULL UNIQUE,
  name                    VARCHAR(160) NOT NULL,
  description             TEXT         NULL,
  start_date              DATE         NOT NULL,
  end_date                DATE         NOT NULL,
  required_attendance_pct TINYINT      NOT NULL DEFAULT 0,
  teacher_id              INT          NOT NULL REFERENCES users (user_id),
  CHECK (end_date >= start_date)
);

CREATE TABLE sessions (
  session_id      INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course_id       INT          NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  seq_no          SMALLINT     NOT NULL,
  topic           VARCHAR(160) NULL,
  starts_at       DATETIME     NOT NULL,
  ends_at         DATETIME     NOT NULL,
  room            VARCHAR(40)  NULL,
  attendance_code VARCHAR(10)  NULL,
  code_expires_at DATETIME     NULL,
  UNIQUE (course_id, seq_no),
  CHECK (ends_at > starts_at)
);

CREATE TABLE enrollments (
  enrollment_id INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id    INT      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  course_id     INT      NOT NULL REFERENCES courses (course_id) ON DELETE CASCADE,
  enrolled_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status        ENUM('ACTIVE','COMPLETED','DROPPED') NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (student_id, course_id)
);

CREATE TABLE attendances (
  attendance_id INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id    INT      NOT NULL REFERENCES sessions (session_id) ON DELETE CASCADE,
  student_id    INT      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  status        ENUM('PRESENT','LATE','ABSENT','EXCUSED') NOT NULL DEFAULT 'ABSENT',
  marked_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  marked_via    ENUM('CODE','TEACHER','IMPORT') NOT NULL DEFAULT 'TEACHER',
  UNIQUE (session_id, student_id)
);
