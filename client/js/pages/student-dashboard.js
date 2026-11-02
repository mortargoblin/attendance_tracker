import * as api from "../api.js";
import { escapeHtml } from "../html.js";
import { t } from "../i18n.js";

export async function renderStudentDashboard(container) {
  container.innerHTML = `
    <h1 class="text-xl font-bold text-slate-900 mb-1">${t("student.dashboard.heading")}</h1>
    <p class="text-sm text-slate-500 mb-4">${t("student.dashboard.intro")}</p>
    <div id="course-list" class="space-y-3"></div>
  `;

  const courses = await api.listCourses();
  const list = container.querySelector("#course-list");
  list.innerHTML = courses.length
    ? courses
        .map(
          (c) => `
            <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between gap-4">
              <p class="font-medium text-slate-900">${escapeHtml(c.name)}</p>
              <div class="flex shrink-0 flex-col gap-2">
                <a href="#/student/confirm?courseId=${encodeURIComponent(c.id)}"
                   class="rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-indigo-700">
                  ${t("student.dashboard.enterCode")}
                </a>
                <a href="#/student/attendance?courseId=${encodeURIComponent(c.id)}"
                   class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">
                  ${t("common.viewAttendance")}
                </a>
              </div>
            </div>
          `
        )
        .join("")
    : `<p class="text-slate-500 text-sm">${t("student.dashboard.noCourses")}</p>`;
}
