import * as api from "../api.js";
import { escapeHtml } from "../html.js";
import { STATUSES, badge } from "../attendance-status.js";
import { t, formatDate, formatPercent } from "../i18n.js";
import { backLink, showMessage, hideMessage, downloadBlob } from "../ui.js";

// the table needs more room than the other pages
const NARROW = "sm:max-w-lg";
const WIDE = "sm:max-w-4xl";

/** a session's column header: its number with the date underneath */
function sessionHeader(session) {
  const date = escapeHtml(formatDate(session.startedAt));
  return `
    <th class="px-2 py-2 text-center font-medium whitespace-nowrap" title="${date}">
      ${t("teacher.attendance.sessionColumn", { n: session.seqNo })}<div class="text-xs font-normal text-slate-400">${date}</div>
    </th>
  `;
}

/** one status as a coloured one-character badge, full label on hover */
function statusCell(status) {
  const b = badge(status);
  return `<td class="px-2 py-2 text-center">
            <span title="${escapeHtml(b.label)}" class="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium ${b.classes}">${b.short}</span>
          </td>`;
}

/** a student's row: name, a cell per session, then attended/total (percent) */
function studentRow(student, sessionCount) {
  const percent = sessionCount === 0 ? "–" : formatPercent(student.attended / sessionCount);
  return `
    <tr>
      <td class="sticky start-0 bg-white py-2 pe-3 whitespace-nowrap text-slate-800">${escapeHtml(student.name)}</td>
      ${student.statuses.map(statusCell).join("")}
      <td class="py-2 ps-3 text-end whitespace-nowrap text-slate-800">
        ${t("teacher.attendance.attendedOf", { attended: student.attended, total: sessionCount })}
        <span class="text-slate-400">(${percent})</span>
      </td>
    </tr>
  `;
}

/** what each badge means, under the table */
function legend() {
  const items = STATUSES.map((status) => {
    const b = badge(status);
    return `<span class="inline-flex items-center gap-1">
              <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-medium ${b.classes}">${b.short}</span>${b.label}
            </span>`;
  });
  return `<p class="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">${items.join("")}</p>`;
}

/**
 * the students x sessions table, or a note if either list is empty. it uses
 * logical classes (ps/pe, start-0, text-start/end), so in a right-to-left
 * language the student column sticks to the right and the total column ends
 * up on the left.
 */
function attendanceTable(sessions, students) {
  if (students.length === 0) return `<p class="text-slate-500 text-sm">${t("teacher.attendance.noStudents")}</p>`;
  if (sessions.length === 0) return `<p class="text-slate-500 text-sm">${t("teacher.attendance.noSessions")}</p>`;
  return `
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-start text-slate-500">
            <th class="sticky start-0 bg-white py-2 pe-3 text-start font-medium">${t("teacher.attendance.student")}</th>
            ${sessions.map(sessionHeader).join("")}
            <th class="py-2 ps-3 text-end font-medium">${t("teacher.attendance.total")}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${students.map((student) => studentRow(student, sessions.length)).join("")}
        </tbody>
      </table>
    </div>
    ${legend()}
  `;
}

/**
 * the teacher's attendance overview for one course, with excel export.
 * @param {HTMLElement} container
 * @param {URLSearchParams} params courseId
 * @returns {Promise<() => void>} cleanup: puts the usual page width back
 */
export async function renderTeacherAttendance(container, params) {
  const courseId = params.get("courseId");
  const report = await api.getCourseAttendance(courseId);
  const { sessions, students } = report;

  container.innerHTML = `
    ${backLink("#/teacher")}
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
      ${attendanceTable(sessions, students)}
      <p id="message" class="mt-3" hidden></p>
    </div>
  `;

  container.classList.replace(NARROW, WIDE);

  const exportBtn = container.querySelector("#export-btn");
  const message = container.querySelector("#message");

  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    hideMessage(message);
    try {
      const blob = await api.exportCourseAttendance(courseId);
      downloadBlob(blob, t("teacher.attendance.exportFilename", { course: report.courseName }));
    } catch (err) {
      showMessage(message, err.message);
    } finally {
      exportBtn.disabled = false;
    }
  });

  return () => container.classList.replace(WIDE, NARROW);
}
