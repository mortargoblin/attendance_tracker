import * as api from "../api.js";
import { getCurrentUser } from "../store.js";

export async function renderStudentDashboard(container) {
  const user = getCurrentUser();
  container.innerHTML = `
    <a href="#/student/confirm" class="block w-full text-center mb-6 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
      Enter attendance code
    </a>
    <h1 class="text-xl font-bold text-slate-900 mb-4">Your courses</h1>
    <div id="course-list" class="space-y-3"></div>
  `;

  const courses = await api.listCourses(user);
  const list = container.querySelector("#course-list");
  list.innerHTML = courses.length
    ? courses.map((c) => `<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p class="font-medium text-slate-900">${c.name}</p></div>`).join("")
    : `<p class="text-slate-500 text-sm">You're not enrolled in any courses yet.</p>`;
}
