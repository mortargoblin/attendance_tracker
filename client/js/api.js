// fake api backed by localstorage (see store.js). every exported function is
// async and throws a plain Error("message") on failure; pages catch it and
// show err.message to the user.
//
// to switch to a real backend: rewrite each function body to call fetch()
// against the endpoint suggested in its comment, keep the same name, params
// and return shape, and throw new Error(<server error message>) when the
// response isn't ok. page code should then keep working unchanged.
// the helpers below the imports are mock-only and can be deleted then.

import { read, write, uid } from "./store.js";

// how long a code stays valid after the teacher starts a session.
// in a real backend this lives on the server.
const SESSION_TTL_MS = 15 * 60 * 1000;

// --- mock-only helpers (not exported) ---

// strips private fields (like the password) before handing a user to pages.
function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// flips an active session to "expired" once its time is up. a real server
// would do this itself when reporting a session's status.
function refreshExpiry(session) {
  if (session.status === "active" && Date.now() > session.expiresAt) {
    session.status = "expired";
  }
  return session;
}

function randomCode() {
  return String(Math.floor(Math.random() * 100)).padStart(2, "0");
}

// picks a 2-digit code that no currently active session is using.
function generateUniqueCode(sessions) {
  const activeCodes = new Set(sessions.filter((s) => refreshExpiry(s).status === "active").map((s) => s.code));
  let code = randomCode();
  while (activeCodes.has(code)) code = randomCode();
  return code;
}

// --- auth ---

// log in with email + password.
// real backend: POST /api/auth/login  body { email, password }
// returns { token, user: { id, name, email, role } }
// throws "Incorrect email or password." on bad credentials.
export async function login({ email, password }) {
  const user = read("users", []).find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || user.passwordPlain !== password) {
    throw new Error("Incorrect email or password.");
  }
  return { token: uid("tok"), user: toPublicUser(user) };
}

// create a new account and log straight into it.
// real backend: POST /api/auth/register  body { name, email, password, role }
// role is "student" or "teacher".
// returns { token, user: { id, name, email, role } }
// throws if the email is already taken.
export async function register({ name, email, password, role }) {
  const users = read("users", []);
  if (users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    throw new Error("An account with that email already exists.");
  }
  const user = { id: uid("u"), name, email, passwordPlain: password, role };
  write("users", [...users, user]);
  return { token: uid("tok"), user: toPublicUser(user) };
}

// --- users ---

// list every student account, e.g. to pick who to enroll in a new course.
// real backend: GET /api/students  (teacher only)
// returns [{ id, name, email, role }], sorted by name.
export async function listStudents() {
  return read("users", [])
    .filter((u) => u.role === "student")
    .map(toPublicUser)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- courses ---

// list the courses relevant to the logged-in user: the ones a teacher
// teaches, or the ones a student is enrolled in.
// real backend: GET /api/courses  (server works out the user from the token,
// so the currentUser param can be dropped then)
// returns [{ id, name, teacherId, studentIds: [id, ...] }]
export async function listCourses(currentUser) {
  const courses = read("courses", []);
  return currentUser.role === "teacher"
    ? courses.filter((c) => c.teacherId === currentUser.id)
    : courses.filter((c) => c.studentIds.includes(currentUser.id));
}

// create a new course taught by the logged-in teacher.
// real backend: POST /api/courses  body { name, studentIds }  (teacher only;
// server takes the teacher id from the token)
// returns the new course { id, name, teacherId, studentIds }
// throws if the name is empty or the teacher already has a course with that
// name.
export async function createCourse({ name, studentIds = [] }, currentUser) {
  const trimmed = String(name).trim();
  if (!trimmed) throw new Error("Course name is required.");

  const courses = read("courses", []);
  const duplicate = courses.some(
    (c) => c.teacherId === currentUser.id && c.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) throw new Error("You already have a course with that name.");

  const course = { id: uid("c"), name: trimmed, teacherId: currentUser.id, studentIds };
  write("courses", [...courses, course]);
  return course;
}

// get one course with its enrolled students filled in.
// real backend: GET /api/courses/:courseId
// returns { id, name, students: [{ id, name, email, role }] }
// throws "Course not found." if the id is unknown.
export async function getCourse(courseId) {
  const course = read("courses", []).find((c) => c.id === courseId);
  if (!course) throw new Error("Course not found.");
  const users = read("users", []);
  const students = course.studentIds.map((id) => users.find((u) => u.id === id)).filter(Boolean).map(toPublicUser);
  return { id: course.id, name: course.name, students };
}

// --- attendance sessions ---

// start a new attendance session for a course and generate its 2-digit code.
// real backend: POST /api/courses/:courseId/sessions  (teacher only)
// returns { id, courseId, code, status: "active", createdAt, expiresAt,
// confirmations: [] }  (times are ms since epoch)
export async function startAttendanceSession(courseId) {
  const sessions = read("sessions", []);
  const now = Date.now();
  const session = {
    id: uid("s"),
    courseId,
    code: generateUniqueCode(sessions),
    status: "active",
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    confirmations: [],
  };
  write("sessions", [...sessions, session]);
  return session;
}

// get the current state of a session; the teacher's page polls this to show
// who has confirmed so far.
// real backend: GET /api/sessions/:sessionId
// returns the same session shape as startAttendanceSession, with status one
// of "active" | "expired" | "ended" and confirmations as
// [{ studentId, confirmedAt }]
// throws "Session not found." if the id is unknown.
export async function getSessionStatus(sessionId) {
  const sessions = read("sessions", []);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error("Session not found.");
  refreshExpiry(session);
  write("sessions", sessions);
  return session;
}

// student confirms attendance by typing the code shown on screen.
// confirming twice is not an error, it just reports the original time.
// real backend: POST /api/attendance/confirm  body { code }  (student only;
// server takes the student id from the token)
// returns { courseName, confirmedAt, alreadyConfirmed }
// throws if the code is expired, doesn't match an active session, or belongs
// to a course the student isn't enrolled in.
export async function confirmAttendanceByCode(code, currentUser) {
  const sessions = read("sessions", []);
  const courses = read("courses", []);

  const session = sessions.find((s) => s.code === code && refreshExpiry(s).status !== "expired");
  if (!session) {
    const everMatched = sessions.some((s) => s.code === code);
    throw new Error(everMatched ? "This code has expired." : "That code doesn't match an active session.");
  }

  const course = courses.find((c) => c.id === session.courseId);
  if (!course || !course.studentIds.includes(currentUser.id)) {
    throw new Error("Code not recognized.");
  }

  const existing = session.confirmations.find((c) => c.studentId === currentUser.id);
  if (!existing) {
    session.confirmations.push({ studentId: currentUser.id, confirmedAt: Date.now() });
    write("sessions", sessions);
  }

  return {
    courseName: course.name,
    confirmedAt: existing ? existing.confirmedAt : Date.now(),
    alreadyConfirmed: Boolean(existing),
  };
}

// teacher closes a session early so the code stops working.
// real backend: POST /api/sessions/:sessionId/end  (teacher only)
// returns the updated session with status "ended".
// throws "Session not found." if the id is unknown.
export async function endSession(sessionId) {
  const sessions = read("sessions", []);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error("Session not found.");
  session.status = "ended";
  write("sessions", sessions);
  return session;
}
