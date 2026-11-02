import * as api from "../api.js";
import { escapeHtml } from "../html.js";
import { badge } from "../attendance-status.js";
import { t, formatDate, formatPercent } from "../i18n.js";

export async function renderStudentAttendance(container, params) {
  const courseId = params.get("courseId");
  // for a student the report only holds their own row
  const report = await api.getCourseAttendance(courseId);
  const { sessions } = report;
  const me = report.students[0];
  if (!me) throw new Error(t("server.courseNotFound"));

  const dateFormat = { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" };
  const ratio = sessions.length === 0 ? 0 : me.attended / sessions.length;

  // newest first, so the session they just confirmed is at the top
  const rows = sessions
    .map((session, i) => ({ session, status: me.statuses[i] }))
    .reverse()
    .map(({ session, status }) => {
      const b = badge(status);
      return `
        <li class="flex items-center justify-between gap-4 py-3">
          <div>
            <p class="font-medium text-slate-900">${t("common.sessionNumber", { n: session.seqNo })}</p>
            <p class="text-sm text-slate-500">${escapeHtml(formatDate(session.startedAt, dateFormat))}</p>
          </div>
          <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${b.classes}">${b.label}</span>
        </li>
      `;
    })
    .join("");

  container.innerHTML = `
    <a href="#/student" class="text-sm text-indigo-600 hover:underline"><span class="inline-block rtl:-scale-x-100">&larr;</span> ${t("common.backToCourses")}</a>
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mt-4">
      <h1 class="text-xl font-bold text-slate-900">${escapeHtml(report.courseName)}</h1>
      ${
        sessions.length === 0
          ? `<p class="mt-4 text-slate-500 text-sm">${t("common.noSessions")}</p>`
          : `
            <p class="text-sm text-slate-500">
              ${t("student.attendance.summary", { attended: me.attended, count: sessions.length, percent: formatPercent(ratio) })}
            </p>
            <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full bg-indigo-600" style="width: ${Math.round(ratio * 100)}%"></div>
            </div>
            <ul class="mt-4 divide-y divide-slate-100">${rows}</ul>
          `
      }
    </div>
  `;
}
