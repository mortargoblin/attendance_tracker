import * as api from "../api.js";
import { escapeHtml } from "../html.js";
import { navigate } from "../router.js";
import { t } from "../i18n.js";
import { showMessage, hideMessage } from "../ui.js";

const LIST_LIMIT = 20; // up to this many students are shown as a plain checklist
const MIN_SEARCH_CHARS = 3;
const SEARCH_DELAY_MS = 250;
const SEARCH_RESULT_LIMIT = 50; // the server's maximum for /api/students?limit=

/** a checkbox line for one student in the picker */
function studentRow(s, checked) {
  return `
    <label class="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name="student" value="${s.id}" ${checked ? "checked" : ""}> ${escapeHtml(s.name)}
      <span class="text-slate-400" dir="ltr">${escapeHtml(s.email)}</span>
    </label>
  `;
}

/**
 * the student picker in the new course form: a plain checklist while there
 * are few students, a search box once there are more than LIST_LIMIT.
 */
function studentPickerHtml(students, searchMode) {
  if (students.length === 0) {
    return `<p class="text-slate-500 text-sm">${t("teacher.dashboard.noStudentAccounts")}</p>`;
  }
  if (!searchMode) {
    return `<div class="max-h-48 overflow-y-auto space-y-1">${students.map((s) => studentRow(s, false)).join("")}</div>`;
  }
  return `
    <input id="student-search" type="search" autocomplete="off" placeholder="${t("teacher.dashboard.searchStudents", { min: MIN_SEARCH_CHARS })}"
      class="block w-full rounded-lg border border-slate-300 px-3 py-2 mb-2">
    <div id="selected-students" class="mb-2 flex flex-wrap gap-1"></div>
    <div id="student-results" class="max-h-48 overflow-y-auto space-y-1"></div>
  `;
}

/**
 * wires up the search box: debounced server search, ticked students shown
 * as removable chips. ticks survive new searches, since results get replaced.
 * @param {HTMLElement} container
 * @param {HTMLElement} message where search errors are shown
 * @returns {() => number[]} the ids of the ticked students
 */
function setupStudentSearch(container, message) {
  const input = container.querySelector("#student-search");
  const results = container.querySelector("#student-results");
  const chips = container.querySelector("#selected-students");
  const selected = new Map(); // id -> student, everyone ticked so far
  let found = new Map(); // id -> student, the results on screen now
  let timer;
  let latest = 0; // number of the newest search, to drop stale answers

  const renderChips = () => {
    chips.innerHTML = [...selected.values()]
      .map(
        (s) => `<button type="button" data-remove="${s.id}" class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800 hover:bg-indigo-100">
                  ${escapeHtml(s.name)} &times;
                </button>`
      )
      .join("");
  };

  const showHint = () => {
    results.innerHTML = `<p class="text-slate-500 text-sm">${t("teacher.dashboard.searchHint", { min: MIN_SEARCH_CHARS })}</p>`;
  };

  const search = async () => {
    const q = input.value.trim();
    if (q.length < MIN_SEARCH_CHARS) {
      latest++; // ignore any search still in flight
      showHint();
      return;
    }
    const ticket = ++latest;
    try {
      const students = await api.listStudents({ q, limit: SEARCH_RESULT_LIMIT });
      if (ticket !== latest) return; // a newer search is already running
      found = new Map(students.map((s) => [s.id, s]));
      results.innerHTML = students.length
        ? students.map((s) => studentRow(s, selected.has(s.id))).join("")
        : `<p class="text-slate-500 text-sm">${t("teacher.dashboard.noMatches")}</p>`;
    } catch (err) {
      showMessage(message, err.message);
    }
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(search, SEARCH_DELAY_MS);
  });

  results.addEventListener("change", (event) => {
    const box = event.target;
    const id = Number(box.value);
    const student = found.get(id);
    if (box.checked && student) selected.set(id, student);
    else selected.delete(id);
    renderChips();
  });

  chips.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove]");
    if (!btn) return;
    selected.delete(Number(btn.dataset.remove));
    renderChips();
    const box = results.querySelector(`input[value="${btn.dataset.remove}"]`);
    if (box) box.checked = false;
  });

  // the hint shows while the field is focused or holds 1-2 characters; an
  // empty field that isn't focused shows nothing
  input.addEventListener("focus", () => {
    if (input.value.trim().length < MIN_SEARCH_CHARS) showHint();
  });
  input.addEventListener("blur", () => {
    if (input.value.trim().length === 0) results.innerHTML = "";
  });

  return () => [...selected.keys()];
}

/** one course card with its start-session and view-attendance actions */
function courseCard(course) {
  return `
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between gap-4">
      <div>
        <p class="font-medium text-slate-900">${escapeHtml(course.name)}</p>
        <p class="text-sm text-slate-500">${t("common.studentCount", { count: course.studentIds.length })}</p>
      </div>
      <div class="flex shrink-0 flex-col gap-2">
        <button data-course-id="${course.id}" class="start-session-btn rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
          ${t("teacher.dashboard.startSession")}
        </button>
        <a href="#/teacher/attendance?courseId=${encodeURIComponent(course.id)}" class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
          ${t("common.viewAttendance")}
        </a>
      </div>
    </div>
  `;
}

/**
 * fills the course list; a start button opens the new session's live page.
 * @param {HTMLElement} list
 * @param {HTMLElement} message where a failed start is shown
 */
function renderCourseList(list, message, courses) {
  if (courses.length === 0) {
    list.innerHTML = `<p class="text-slate-500 text-sm">${t("teacher.dashboard.noCourses")}</p>`;
    return;
  }
  list.innerHTML = courses.map(courseCard).join("");
  list.addEventListener("click", async (event) => {
    const btn = event.target.closest(".start-session-btn");
    if (!btn) return;
    hideMessage(message);
    try {
      const session = await api.startAttendanceSession(btn.dataset.courseId);
      navigate(`/teacher/session?sessionId=${session.id}`);
    } catch (err) {
      showMessage(message, err.message);
    }
  });
}

/**
 * the teacher's home page: a new course form and their course list.
 * @param {HTMLElement} container
 */
export async function renderTeacherDashboard(container) {
  // one more than the limit tells us whether to switch to searching
  const [courses, students] = await Promise.all([api.listCourses(), api.listStudents({ limit: LIST_LIMIT + 1 })]);
  const searchMode = students.length > LIST_LIMIT;

  container.innerHTML = `
    <form id="create-course-form" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 mb-6">
      <h2 class="text-lg font-semibold text-slate-900">${t("teacher.dashboard.newCourse")}</h2>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1" for="course-name">${t("teacher.dashboard.courseName")}</label>
        <input class="block w-full rounded-lg border border-slate-300 px-3 py-2" type="text" id="course-name" required>
      </div>
      <fieldset>
        <legend class="block text-sm font-medium text-slate-700 mb-1">${t("teacher.dashboard.students")}</legend>
        ${studentPickerHtml(students, searchMode)}
      </fieldset>
      <button type="submit" class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">${t("teacher.dashboard.createCourse")}</button>
      <p id="message" hidden></p>
    </form>

    <h1 class="text-xl font-bold text-slate-900 mb-4">${t("teacher.dashboard.heading")}</h1>
    <p id="list-message" class="mb-3" hidden></p>
    <div id="course-list" class="space-y-3"></div>
  `;

  const message = container.querySelector("#message");
  const selectedIds = searchMode
    ? setupStudentSearch(container, message)
    : () => [...container.querySelectorAll('input[name="student"]:checked')].map((el) => Number(el.value));

  container.querySelector("#create-course-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(message);
    try {
      await api.createCourse({ name: container.querySelector("#course-name").value, studentIds: selectedIds() });
      // re-render so the new course shows up in the list below
      renderTeacherDashboard(container);
    } catch (err) {
      showMessage(message, err.message);
    }
  });

  renderCourseList(container.querySelector("#course-list"), container.querySelector("#list-message"), courses);
}
