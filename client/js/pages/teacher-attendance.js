import * as api from "../api.js";
import { escapeHtml } from "../html.js";
import { STATUSES, badge } from "../attendance-status.js";
import { t, formatDate, formatPercent } from "../i18n.js";

export async function renderTeacherAttendance(container, params) {
  const courseId = params.get("courseId");
  const report = await api.getCourseAttendance(courseId);
  const { sessions, students } = report;

  const percent = (student) => (sessions.length === 0 ? "–" : formatPercent(student.attended / sessions.length));

  // the table uses logical classes (ps/pe, start-0, text-start/end) so in a
  // right-to-left language the student column sticks to the right and the
  // total column ends up on the left
  let table;
  if (students.length === 0) {
    table = `<p class="text-slate-500 text-sm">${t("teacher.attendance.noStudents")}</p>`;
  } else if (sessions.length === 0) {
    table = `<p class="text-slate-500 text-sm">${t("teacher.attendance.noSessions")}</p>`;
  } else {
    table = `
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-start text-slate-500">
              <th class="sticky start-0 bg-white py-2 pe-3 text-start font-medium">${t("teacher.attendance.student")}</th>
              ${sessions
                .map(
                  (s) => `
                    <th class="px-2 py-2 text-center font-medium whitespace-nowrap" title="${escapeHtml(formatDate(s.startedAt))}">
                      ${t("teacher.attendance.sessionColumn", { n: s.seqNo })}<div class="text-xs font-normal text-slate-400">${escapeHtml(formatDate(s.startedAt))}</div>
                    </th>
                  `
                )
                .join("")}
              <th class="py-2 ps-3 text-end font-medium">${t("teacher.attendance.total")}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${students
              .map(
                (student) => `
                  <tr>
                    <td class="sticky start-0 bg-white py-2 pe-3 whitespace-nowrap text-slate-800">${escapeHtml(student.name)}</td>
                    ${student.statuses
                      .map((status) => {
                        const b = badge(status);
                        return `<td class="px-2 py-2 text-center">
                                  <span title="${escapeHtml(b.label)}" class="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium ${b.classes}">${b.short}</span>
                                </td>`;
                      })
                      .join("")}
                    <td class="py-2 ps-3 text-end whitespace-nowrap text-slate-800">
                      ${t("teacher.attendance.attendedOf", { attended: student.attended, total: sessions.length })}
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
        ${STATUSES.map((status) => {
          const b = badge(status);
          return `<span class="inline-flex items-center gap-1">
                    <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-medium ${b.classes}">${b.short}</span>${b.label}
                  </span>`;
        }).join("")}
      </p>
    `;
  }

  container.innerHTML = `
    <a href="#/teacher" class="text-sm text-indigo-600 hover:underline"><span class="inline-block rtl:-scale-x-100">&larr;</span> ${t("common.backToCourses")}</a>
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mt-4">
      <div class="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">${escapeHtml(report.courseName)}</h1>
          <p class="text-sm text-slate-500">
            ${t("common.sessionCount", { count: sessions.length })} · ${t("common.studentCount", { count: students.length })}
          </p>
        </div>
        <button id="export-btn" class="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          ${t("teacher.attendance.export")}
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
      link.download = t("teacher.attendance.exportFilename", { course: report.courseName });
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
