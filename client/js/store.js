// fake database (localstorage) + auth session (sessionstorage), standing in
// for a real backend until one exists. swap this file out once there's a
// real api to call.

const PREFIX = "att_";

export function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function seedIfEmpty() {
  if (read("users", null)) return;

  const teacher = { id: uid("u"), name: "Jane Teacher", email: "teacher@example.com", passwordPlain: "password", role: "teacher" };
  const students = [
    { id: uid("u"), name: "Alex Student", email: "alex@example.com", passwordPlain: "password", role: "student" },
    { id: uid("u"), name: "Sam Student", email: "sam@example.com", passwordPlain: "password", role: "student" },
    { id: uid("u"), name: "Riley Student", email: "riley@example.com", passwordPlain: "password", role: "student" },
  ];

  write("users", [teacher, ...students]);
  write("courses", [
    { id: uid("c"), name: "OTP", teacherId: teacher.id, studentIds: students.map((s) => s.id) },
    { id: uid("c"), name: "Design Patterns", teacherId: teacher.id, studentIds: [students[0].id, students[1].id] },
  ]);
  write("sessions", []);
}

// auth session lives in sessionstorage (per-tab) rather than localstorage
// (shared per-origin) so a teacher tab and a student tab can be signed in
// as two different users in the same browser at once, while the data above
// still lives in localstorage so both tabs see the same courses/sessions.

export function getSession() {
  try {
    const raw = sessionStorage.getItem(PREFIX + "auth");
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession({ token, user }) {
  sessionStorage.setItem(PREFIX + "auth", JSON.stringify({ token, userId: user.id, role: user.role }));
}

export function clearSession() {
  sessionStorage.removeItem(PREFIX + "auth");
}

export function getCurrentUser() {
  const session = getSession();
  if (!session) return null;
  const user = read("users", []).find((u) => u.id === session.userId);
  return user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
}
