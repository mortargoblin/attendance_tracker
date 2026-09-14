import { getCurrentUser, clearSession, seedIfEmpty } from "./store.js";
import { renderLogin } from "./pages/login.js";
import { renderRegister } from "./pages/register.js";
import { renderStudentDashboard } from "./pages/student-dashboard.js";
import { renderConfirm } from "./pages/student-confirm.js";
import { renderTeacherDashboard } from "./pages/teacher-dashboard.js";
import { renderTeacherSession } from "./pages/teacher-session.js";

const routes = {
  "/login": { render: renderLogin },
  "/register": { render: renderRegister },
  "/student": { render: renderStudentDashboard, role: "student" },
  "/student/confirm": { render: renderConfirm, role: "student" },
  "/teacher": { render: renderTeacherDashboard, role: "teacher" },
  "/teacher/session": { render: renderTeacherSession, role: "teacher" },
};

seedIfEmpty();

export function navigate(path) {
  location.hash = "#" + path;
}

function renderHeader(user) {
  const header = document.getElementById("app-header");
  if (!user) {
    header.hidden = true;
    return;
  }
  header.hidden = false;
  document.getElementById("header-user-name").textContent = user.name;
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
  currentCleanup = (await match.render(app, params)) || null;
}

document.getElementById("logout-btn").addEventListener("click", () => {
  clearSession();
  navigate("/login");
});

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);
