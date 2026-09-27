import * as api from "../api.js";
import { getCurrentUser } from "../store.js";
import { navigate } from "../router.js";

export async function renderTeacherDashboard(container) {
  const user = getCurrentUser();
  const [courses, students] = await Promise.all([api.listCourses(user), api.listStudents()]);

  container.innerHTML = `
    <form id="create-course-form" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 mb-6">
      <h2 class="text-lg font-semibold text-slate-900">New course</h2>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1" for="course-name">Course name</label>
        <input class="block w-full rounded-lg border border-slate-300 px-3 py-2" type="text" id="course-name" required>
      </div>
      <fieldset>
        <legend class="block text-sm font-medium text-slate-700 mb-1">Students</legend>
        ${
          students.length === 0
            ? `<p class="text-slate-500 text-sm">No student accounts yet.</p>`
            : `<div class="max-h-48 overflow-y-auto space-y-1">
                ${students
                  .map(
                    (s) => `
                      <label class="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" name="student" value="${s.id}"> ${s.name}
                        <span class="text-slate-400">${s.email}</span>
                      </label>
                    `
                  )
                  .join("")}
              </div>`
        }
      </fieldset>
      <button type="submit" class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">Create course</button>
      <p id="message" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" hidden></p>
    </form>

    <h1 class="text-xl font-bold text-slate-900 mb-4">Your courses</h1>
    <div id="course-list" class="space-y-3"></div>
  `;

  const message = container.querySelector("#message");

  container.querySelector("#create-course-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    message.hidden = true;
    try {
      await api.createCourse(
        {
          name: container.querySelector("#course-name").value,
          studentIds: [...container.querySelectorAll('input[name="student"]:checked')].map((el) => el.value),
        },
        user
      );
      // re-render so the new course shows up in the list below
      renderTeacherDashboard(container);
    } catch (err) {
      message.textContent = err.message;
      message.hidden = false;
    }
  });

  const list = container.querySelector("#course-list");

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
