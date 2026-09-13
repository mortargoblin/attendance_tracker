import * as api from "../api.js";
import { getCurrentUser } from "../store.js";
import { navigate } from "../router.js";

export async function renderTeacherDashboard(container) {
  const user = getCurrentUser();
  container.innerHTML = `
    <h1 class="text-xl font-bold text-slate-900 mb-4">Your courses</h1>
    <div id="course-list" class="space-y-3"></div>
  `;

  const list = container.querySelector("#course-list");
  const courses = await api.listCourses(user);

  if (courses.length === 0) {
    list.innerHTML = `<p class="text-slate-500 text-sm">No courses yet.</p>`;
    return;
  }

  list.innerHTML = courses
    .map(
      (course) => `
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between gap-4">
          <div>
            <p class="font-medium text-slate-900">${course.name}</p>
            <p class="text-sm text-slate-500">${course.studentIds.length} student${course.studentIds.length === 1 ? "" : "s"}</p>
          </div>
          <button data-course-id="${course.id}" class="start-session-btn shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
            Start attendance session
          </button>
        </div>
      `
    )
    .join("");

  list.querySelectorAll(".start-session-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const session = await api.startAttendanceSession(btn.dataset.courseId);
      navigate(`/teacher/session?sessionId=${session.id}`);
    });
  });
}
