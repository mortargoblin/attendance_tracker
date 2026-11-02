import * as api from "../api.js";
import { escapeHtml } from "../html.js";
import { navigate } from "../router.js";
import { t } from "../i18n.js";

const LIST_LIMIT = 20; // up to this many students are shown as a plain checklist
const MIN_SEARCH_CHARS = 3;
const SEARCH_DELAY_MS = 250;

function studentRow(s, checked) {
  return `
    <label class="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name="student" value="${s.id}" ${checked ? "checked" : ""}> ${escapeHtml(s.name)}
      <span class="text-slate-400" dir="ltr">${escapeHtml(s.email)}</span>
    </label>
  `;
}

export async function renderTeacherDashboard(container) {
  // one more than the limit tells us whether to switch to searching
  const [courses, firstStudents] = await Promise.all([api.listCourses(), api.listStudents({ limit: LIST_LIMIT + 1 })]);
  const searchMode = firstStudents.length > LIST_LIMIT;
  const students = firstStudents;
  // students ticked so far; kept across searches since results get replaced
  const selected = new Map();

  let studentsHtml;
  if (students.length === 0) {
    studentsHtml = `<p class="text-slate-500 text-sm">${t("teacher.dashboard.noStudentAccounts")}</p>`;
  } else if (!searchMode) {
    studentsHtml = `<div class="max-h-48 overflow-y-auto space-y-1">${students.map((s) => studentRow(s, false)).join("")}</div>`;
  } else {
    studentsHtml = `
      <input id="student-search" type="search" autocomplete="off" placeholder="${t("teacher.dashboard.searchStudents", { min: MIN_SEARCH_CHARS })}"
        class="block w-full rounded-lg border border-slate-300 px-3 py-2 mb-2">
      <div id="selected-students" class="mb-2 flex flex-wrap gap-1"></div>
      <div id="student-results" class="max-h-48 overflow-y-auto space-y-1"></div>
    `;
  }

  container.innerHTML = `
    <form id="create-course-form" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 mb-6">
      <h2 class="text-lg font-semibold text-slate-900">${t("teacher.dashboard.newCourse")}</h2>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1" for="course-name">${t("teacher.dashboard.courseName")}</label>
        <input class="block w-full rounded-lg border border-slate-300 px-3 py-2" type="text" id="course-name" required>
      </div>
      <fieldset>
        <legend class="block text-sm font-medium text-slate-700 mb-1">${t("teacher.dashboard.students")}</legend>
        ${studentsHtml}
      </fieldset>
      <button type="submit" class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">${t("teacher.dashboard.createCourse")}</button>
      <p id="message" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" hidden></p>
    </form>

    <h1 class="text-xl font-bold text-slate-900 mb-4">${t("teacher.dashboard.heading")}</h1>
    <div id="course-list" class="space-y-3"></div>
  `;

  const message = container.querySelector("#message");

  if (searchMode) {
    const input = container.querySelector("#student-search");
    const results = container.querySelector("#student-results");
    const chips = container.querySelector("#selected-students");
    let timer;
    let latest = 0;

    const renderChips = () => {
      chips.innerHTML = [...selected.values()]
        .map(
          (s) => `<button type="button" data-remove="${s.id}" class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800 hover:bg-indigo-100">
                    ${escapeHtml(s.name)} &times;
                  </button>`
        )
        .join("");
    };

    const showHint = (text) => {
      results.innerHTML = `<p class="text-slate-500 text-sm">${text}</p>`;
    };

    const search = async () => {
      const q = input.value.trim();
      if (q.length < MIN_SEARCH_CHARS) {
        latest++; // ignore any search still in flight
        showHint(t("teacher.dashboard.searchHint", { min: MIN_SEARCH_CHARS }));
        return;
      }
      const ticket = ++latest;
      try {
        const found = await api.listStudents({ q, limit: 50 });
        if (ticket !== latest) return; // a newer search is already running
        results.innerHTML = found.length
          ? found.map((s) => studentRow(s, selected.has(s.id))).join("")
          : `<p class="text-slate-500 text-sm">${t("teacher.dashboard.noMatches")}</p>`;
        results._found = new Map(found.map((s) => [s.id, s]));
      } catch (err) {
        message.textContent = err.message;
        message.hidden = false;
      }
    };

    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(search, SEARCH_DELAY_MS);
    });

    results.addEventListener("change", (event) => {
      const box = event.target;
      const id = Number(box.value);
      const student = results._found?.get(id);
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
      if (input.value.trim().length < MIN_SEARCH_CHARS) showHint(t("teacher.dashboard.searchHint", { min: MIN_SEARCH_CHARS }));
    });
    input.addEventListener("blur", () => {
      if (input.value.trim().length === 0) results.innerHTML = "";
    });
  }

  container.querySelector("#create-course-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    message.hidden = true;
    try {
      const studentIds = searchMode
        ? [...selected.keys()]
        : [...container.querySelectorAll('input[name="student"]:checked')].map((el) => Number(el.value));
      await api.createCourse({
        name: container.querySelector("#course-name").value,
        studentIds,
      });
      // re-render so the new course shows up in the list below
      renderTeacherDashboard(container);
    } catch (err) {
      message.textContent = err.message;
      message.hidden = false;
    }
  });

  const list = container.querySelector("#course-list");

  if (courses.length === 0) {
    list.innerHTML = `<p class="text-slate-500 text-sm">${t("teacher.dashboard.noCourses")}</p>`;
    return;
  }

  list.innerHTML = courses
    .map(
      (course) => `
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between gap-4">
          <div>
            <p class="font-medium text-slate-900">${escapeHtml(course.name)}</p>
            <p class="text-sm text-slate-500">${t("common.studentCount", { count: course.studentIds.length })}</p>
          </div>
          <div class="flex shrink-0 flex-col gap-2">
            <button data-course-id="${course.id}" class="start-session-btn rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
              ${t("teacher.dashboard.startSession")}
            </button>
            <a href="#/teacher/attendance?courseId=${course.id}" class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
              ${t("common.viewAttendance")}
            </a>
          </div>
        </div>
      `
    )
    .join("");

  list.querySelectorAll(".start-session-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const session = await api.startAttendanceSession(btn.dataset.courseId);
        navigate(`/teacher/session?sessionId=${session.id}`);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}
