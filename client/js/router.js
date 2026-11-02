import { getCurrentUser, clearSession } from "./store.js";
import { logout } from "./api.js";
import { escapeHtml } from "./html.js";
import { LANGUAGES, initI18n, setLanguage, getLanguage } from "./i18n.js";
import { renderLogin } from "./pages/login.js";
import { renderRegister } from "./pages/register.js";
import { renderStudentDashboard } from "./pages/student-dashboard.js";
import { renderConfirm } from "./pages/student-confirm.js";
import { renderStudentAttendance } from "./pages/student-attendance.js";
import { renderTeacherDashboard } from "./pages/teacher-dashboard.js";
import { renderTeacherSession } from "./pages/teacher-session.js";
import { renderTeacherAttendance } from "./pages/teacher-attendance.js";

const routes = {
  "/login": { render: renderLogin },
  "/register": { render: renderRegister },
  "/student": { render: renderStudentDashboard, role: "student" },
  "/student/confirm": { render: renderConfirm, role: "student" },
  "/student/attendance": { render: renderStudentAttendance, role: "student" },
  "/teacher": { render: renderTeacherDashboard, role: "teacher" },
  "/teacher/session": { render: renderTeacherSession, role: "teacher" },
  "/teacher/attendance": { render: renderTeacherAttendance, role: "teacher" },
};

export function navigate(path) {
  location.hash = "#" + path;
}

// the header is always shown (it holds the language picker); only the user's
// name and the log out button depend on being logged in.
function renderHeader(user) {
  document.getElementById("header-user").hidden = !user;
  document.getElementById("header-user-name").textContent = user ? user.name : "";
}

// a page's render function may return a cleanup function (e.g. to stop a
// polling interval); the router calls it right before leaving that page.
let currentCleanup = null;

async function route() {
  const [path, query] = location.hash.slice(1).split("?");
  const params = new URLSearchParams(query);
  const match = routes[path];
  const user = getCurrentUser();

  // unknown or empty path (including the very first load, which has no
  // hash at all): redirect to a canonical route so the url always matches
  // what's on screen.
  if (!match) {
    return navigate(user ? `/${user.role}` : "/login");
  }
  if (match.role && (!user || user.role !== match.role)) {
    return navigate(user ? `/${user.role}` : "/login");
  }
  if (!match.role && user && (path === "/login" || path === "/register")) {
    return navigate(`/${user.role}`);
  }

  if (currentCleanup) currentCleanup();
  renderHeader(user);
  const app = document.getElementById("app");
  app.innerHTML = "";
  currentCleanup = null;
  try {
    currentCleanup = (await match.render(app, params)) || null;
  } catch (err) {
    app.innerHTML = `<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById("logout-btn").addEventListener("click", () => {
  logout();
  clearSession();
  navigate("/login");
});

// language picker: switching re-runs the current route, so the page renders
// again in the new language (and its cleanup runs, e.g. stopping a poll).
const langSelect = document.getElementById("lang-select");
langSelect.innerHTML = Object.entries(LANGUAGES)
  .map(([code, { name }]) => `<option value="${code}" lang="${code}">${escapeHtml(name)}</option>`)
  .join("");
langSelect.addEventListener("change", async () => {
  await setLanguage(langSelect.value);
  route();
});

// translations have to be loaded before the first page renders. module
// scripts run after the document is parsed, so the dom is ready here.
try {
  await initI18n();
} catch (err) {
  // without the translation files every string shows as its key; still
  // better than a blank page
  console.error(err);
}
langSelect.value = getLanguage();
window.addEventListener("hashchange", route);
route();
