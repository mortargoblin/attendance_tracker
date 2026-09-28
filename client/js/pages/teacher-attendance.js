import * as api from "../api.js";
import { escapeHtml } from "../html.js";

const BADGES = {
  present: { label: "Present", short: "✓", classes: "bg-emerald-100 text-emerald-800" },
  late: { label: "Late", short: "L", classes: "bg-amber-100 text-amber-800" },
  absent: { label: "Absent", short: "✗", classes: "bg-red-100 text-red-700" },
  excused: { label: "Excused", short: "E", classes: "bg-sky-100 text-sky-800" },
};

export async function renderTeacherAttendance(container, params) {
  const courseId = params.get("courseId");
  const report = await api.getCourseAttendance(courseId);
  const { sessions, students } = report;

  const formatDate = (ms) =>
    new Date(ms).toLocaleString([], { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  const percent = (student) =>
    sessions.length === 0 ? "–" : `${Math.round((student.attended / sessions.length) * 100)}%`;

  let table;
  if (students.length === 0) {
    table = `<p class="text-slate-500 text-sm">No students are enrolled in this course.</p>`;
  } else if (sessions.length === 0) {
    table = `<p class="text-slate-500 text-sm">No attendance sessions yet. Start one from the course list.</p>`;
  } else {
    table = `
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-left text-slate-500">
              <th class="sticky left-0 bg-white py-2 pr-3 font-medium">Student</th>
              ${sessions
                .map(
                  (s) => `
                    <th class="px-2 py-2 text-center font-medium whitespace-nowrap" title="${escapeHtml(formatDate(s.startedAt))}">
                      #${s.seqNo}<div class="text-xs font-normal text-slate-400">${escapeHtml(formatDate(s.startedAt))}</div>
                    </th>
                  `
                )
                .join("")}
              <th class="py-2 pl-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${students
              .map(
                (student) => `
                  <tr>
                    <td class="sticky left-0 bg-white py-2 pr-3 whitespace-nowrap text-slate-800">${escapeHtml(student.name)}</td>
                    ${student.statuses
                      .map((status) => {
                        const badge = BADGES[status] ?? BADGES.absent;
                        return `<td class="px-2 py-2 text-center">
                                  <span title="${badge.label}" class="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${badge.classes}">${badge.short}</span>
                                </td>`;
                      })
                      .join("")}
                    <td class="py-2 pl-3 text-right whitespace-nowrap text-slate-800">
                      ${student.attended}/${sessions.length}
                      <span class="text-slate-400">(${percent(student)})</span>
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <p class="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        ${Object.values(BADGES)
          .map(
            (b) => `<span class="inline-flex items-center gap-1">
                      <span class="inline-flex h-5 w-5 items-center justify-center rounded-full font-medium ${b.classes}">${b.short}</span>${b.label}
                    </span>`
          )
          .join("")}
      </p>
    `;
  }

  container.innerHTML = `
    <a href="#/teacher" class="text-sm text-indigo-600 hover:underline">&larr; Back to courses</a>
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mt-4">
      <div class="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">${escapeHtml(report.courseName)}</h1>
          <p class="text-sm text-slate-500">
            ${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${students.length} student${students.length === 1 ? "" : "s"}
          </p>
        </div>
        <button id="export-btn" class="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          Export to Excel
        </button>
      </div>
      ${table}
      <p id="message" class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" hidden></p>
    </div>
  `;

  // the table needs more room than the other pages; the returned cleanup
  // puts the usual width back when the router leaves this page
  container.classList.replace("sm:max-w-lg", "sm:max-w-4xl");

  const exportBtn = container.querySelector("#export-btn");
  const message = container.querySelector("#message");

  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    message.hidden = true;
    try {
      const blob = await api.exportCourseAttendance(courseId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.courseName} attendance.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.textContent = err.message;
      message.hidden = false;
    } finally {
      exportBtn.disabled = false;
    }
  });

  return () => container.classList.replace("sm:max-w-4xl", "sm:max-w-lg");
}
