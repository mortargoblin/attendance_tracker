// client for the java backend (server/). every exported function is async
// and throws a plain Error("message") on failure; pages catch it and show
// err.message to the user.
//
// the backend is expected on port 3000 of the same host that serves this
// page; set window.API_BASE before the scripts load to point elsewhere.

import { getSession, clearSession } from "./store.js";

const API_BASE = window.API_BASE ?? `${location.protocol}//${location.hostname}:3000`;

// sends a request with the login token attached and returns the parsed json
// body (or null for an empty response). throws Error(<server message>) when
// the response isn't ok.
async function request(method, path, body) {
  const text = await (await send(method, path, body)).text();
  return text ? JSON.parse(text) : null;
}

// like request() but hands back the raw response for non-json bodies such as
// file downloads. errors are handled the same way.
async function send(method, path, body) {
  const headers = {};
  const session = getSession();
  if (session) headers.Authorization = `Bearer ${session.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch {
      // non-json error page; fall through to the generic message below
    }
    // token expired or revoked (e.g. server restart): drop it and go log in
    // again. login itself also answers 401, but there's no session then.
    if (response.status === 401 && session) {
      clearSession();
      location.hash = "#/login";
    }
    throw new Error(data?.error || `Request failed (${response.status}).`);
  }
  return response;
}

// --- auth ---

// log in with email + password.
// returns { token, user: { id, name, email, role } }
// throws "Incorrect email or password." on bad credentials.
export async function login({ email, password }) {
  return request("POST", "/api/auth/login", { email, password });
}

// create a new account and log straight into it. role is "student" or
// "teacher".
// returns { token, user: { id, name, email, role } }
// throws if the email is already taken.
export async function register({ name, email, password, role }) {
  return request("POST", "/api/auth/register", { name, email, password, role });
}

// invalidates the current token on the server. errors are ignored: the
// caller clears the local session either way.
export async function logout() {
  try {
    await request("POST", "/api/auth/logout");
  } catch {
    // already logged out or server unreachable
  }
}

// --- users ---

// list every student account, e.g. to pick who to enroll in a new course.
// teacher only. returns [{ id, name, email, role }], sorted by name.
export async function listStudents() {
  return request("GET", "/api/students");
}

// --- courses ---

// list the courses relevant to the logged-in user: the ones a teacher
// teaches, or the ones a student is enrolled in.
// returns [{ id, name, teacherId, studentIds: [id, ...] }]
// (for a student, studentIds only contains their own id)
export async function listCourses() {
  return request("GET", "/api/courses");
}

// create a new course taught by the logged-in teacher.
// returns the new course { id, name, teacherId, studentIds }
// throws if the name is empty or the teacher already has a course with that
// name.
export async function createCourse({ name, studentIds = [] }) {
  return request("POST", "/api/courses", { name, studentIds });
}

// get one of the logged-in teacher's courses with its enrolled students.
// returns { id, name, students: [{ id, name, email, role }] }
// throws "Course not found." if the id is unknown.
export async function getCourse(courseId) {
  return request("GET", `/api/courses/${encodeURIComponent(courseId)}`);
}

// attendance of every enrolled student in every session of one of the
// logged-in teacher's courses. teacher only.
// returns { courseId, courseName,
//   sessions: [{ id, seqNo, startedAt }],   (oldest first, ms since epoch)
//   students: [{ id, name, email, attended, statuses: [...] }] }
// where statuses lines up with sessions and each is "present" | "late" |
// "absent" | "excused", and attended counts present + late.
// throws "Course not found." if the id is unknown.
export async function getCourseAttendance(courseId) {
  return request("GET", `/api/courses/${encodeURIComponent(courseId)}/attendance`);
}

// the same attendance table as an excel workbook. teacher only.
// returns a Blob (.xlsx).
export async function exportCourseAttendance(courseId) {
  return (await send("GET", `/api/courses/${encodeURIComponent(courseId)}/attendance/export`)).blob();
}

// --- attendance sessions ---

// start a new attendance session for a course and generate its 2-digit code.
// teacher only.
// returns { id, courseId, code, status: "active", createdAt, expiresAt,
// confirmations: [] }  (times are ms since epoch)
export async function startAttendanceSession(courseId) {
  return request("POST", `/api/courses/${encodeURIComponent(courseId)}/sessions`);
}

// get the current state of a session; the teacher's page polls this to show
// who has confirmed so far.
// returns the same session shape as startAttendanceSession, with status one
// of "active" | "expired" | "ended" and confirmations as
// [{ studentId, confirmedAt }]
// throws "Session not found." if the id is unknown.
export async function getSessionStatus(sessionId) {
  return request("GET", `/api/sessions/${encodeURIComponent(sessionId)}`);
}

// student confirms attendance for one of their courses by typing the code
// shown on screen. confirming twice is not an error, it just reports the
// original time.
// returns { courseName, confirmedAt, alreadyConfirmed }
// throws "Course not found." if the student isn't enrolled in the course, and
// an error if the code is expired or doesn't match that course's active
// session.
export async function confirmAttendanceByCode(courseId, code) {
  return request("POST", `/api/courses/${encodeURIComponent(courseId)}/attendance/confirm`, { code });
}

// teacher closes a session early so the code stops working.
// returns the updated session with status "ended".
// throws "Session not found." if the id is unknown.
export async function endSession(sessionId) {
  return request("POST", `/api/sessions/${encodeURIComponent(sessionId)}/end`);
}
