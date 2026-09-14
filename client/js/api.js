// fake API, replace with fetch()

import { read, write, uid } from "./store.js";

const SESSION_TTL_MS = 15 * 60 * 1000;

function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function refreshExpiry(session) {
  if (session.status === "active" && Date.now() > session.expiresAt) {
    session.status = "expired";
  }
  return session;
}

function randomCode() {
  return String(Math.floor(Math.random() * 100)).padStart(2, "0");
}

function generateUniqueCode(sessions) {
  const activeCodes = new Set(sessions.filter((s) => refreshExpiry(s).status === "active").map((s) => s.code));
  let code = randomCode();
  while (activeCodes.has(code)) code = randomCode();
  return code;
}

export async function login({ email, password }) {
  const user = read("users", []).find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || user.passwordPlain !== password) {
    throw new Error("Incorrect email or password.");
  }
  return { token: uid("tok"), user: toPublicUser(user) };
}

export async function register({ name, email, password, role }) {
  const users = read("users", []);
  if (users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    throw new Error("An account with that email already exists.");
  }
  const user = { id: uid("u"), name, email, passwordPlain: password, role };
  write("users", [...users, user]);
  return { token: uid("tok"), user: toPublicUser(user) };
}

export async function listCourses(currentUser) {
  const courses = read("courses", []);
  return currentUser.role === "teacher"
    ? courses.filter((c) => c.teacherId === currentUser.id)
    : courses.filter((c) => c.studentIds.includes(currentUser.id));
}

export async function getCourse(courseId) {
  const course = read("courses", []).find((c) => c.id === courseId);
  if (!course) throw new Error("Course not found.");
  const users = read("users", []);
  const students = course.studentIds.map((id) => users.find((u) => u.id === id)).filter(Boolean).map(toPublicUser);
  return { id: course.id, name: course.name, students };
}

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

export async function getSessionStatus(sessionId) {
  const sessions = read("sessions", []);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error("Session not found.");
  refreshExpiry(session);
  write("sessions", sessions);
  return session;
}

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

export async function endSession(sessionId) {
  const sessions = read("sessions", []);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error("Session not found.");
  session.status = "ended";
  write("sessions", sessions);
  return session;
}
