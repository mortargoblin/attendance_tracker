import * as api from "../api.js";
import { escapeHtml } from "../html.js";

export async function renderStudentDashboard(container) {
  container.innerHTML = `
    <h1 class="text-xl font-bold text-slate-900 mb-1">Your courses</h1>
    <p class="text-sm text-slate-500 mb-4">Pick a course to enter its attendance code.</p>
    <div id="course-list" class="space-y-3"></div>
  `;

  const courses = await api.listCourses();
  const list = container.querySelector("#course-list");
  list.innerHTML = courses.length
    ? courses
        .map(
          (c) => `
            <a href="#/student/confirm?courseId=${encodeURIComponent(c.id)}"
               class="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300 hover:bg-indigo-50">
              <span class="font-medium text-slate-900">${escapeHtml(c.name)}</span>
              <span class="shrink-0 text-sm font-medium text-indigo-600">Enter code &rarr;</span>
            </a>
          `
        )
        .join("")
    : `<p class="text-slate-500 text-sm">You're not enrolled in any courses yet.</p>`;
}
