import * as api from "../api.js";
import { escapeHtml } from "../html.js";
import { t, formatNumber, formatTime } from "../i18n.js";

export async function renderTeacherSession(container, params) {
  const sessionId = params.get("sessionId");
  const session = await api.getSessionStatus(sessionId);
  const course = await api.getCourse(session.courseId);

  // the code itself stays in ascii digits and left-to-right: it's what
  // students type, whatever language either side is using
  container.innerHTML = `
    <a href="#/teacher" class="text-sm text-indigo-600 hover:underline"><span class="inline-block rtl:-scale-x-100">&larr;</span> ${t("common.backToCourses")}</a>
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-center mt-4">
      <p class="text-slate-500 text-sm">${escapeHtml(course.name)}</p>
      <p id="session-code" dir="ltr" class="font-mono tracking-[0.3em] text-7xl font-bold text-indigo-700 my-4">--</p>
      <p id="status-line" class="text-sm text-slate-500"></p>
    </div>
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mt-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-slate-900">${t("teacher.session.roster")}</h2>
        <span id="roster-summary" class="text-sm text-slate-500"></span>
      </div>
      <ul id="roster-list" class="divide-y divide-slate-100"></ul>
    </div>
    <button id="end-session-btn" class="w-full mt-4 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">${t("teacher.session.end")}</button>
  `;

  function render(session) {
    container.querySelector("#session-code").textContent = session.code;

    const endBtn = container.querySelector("#end-session-btn");
    if (session.status === "active") {
      const remainingMs = Math.max(0, session.expiresAt - Date.now());
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      const time = `${formatNumber(mins)}:${formatNumber(secs, { minimumIntegerDigits: 2 })}`;
      container.querySelector("#status-line").textContent = t("teacher.session.activeExpiresIn", { time });
      endBtn.disabled = false;
      endBtn.textContent = t("teacher.session.end");
    } else {
      const expired = session.status === "expired";
      container.querySelector("#status-line").textContent = t(expired ? "teacher.session.expired" : "teacher.session.ended");
      endBtn.disabled = true;
      endBtn.textContent = t(expired ? "teacher.session.expiredButton" : "teacher.session.endedButton");
    }

    const confirmedIds = new Set(session.confirmations.map((c) => c.studentId));
    container.querySelector("#roster-summary").textContent = t("teacher.session.confirmedCount", {
      confirmed: confirmedIds.size,
      total: course.students.length,
    });

    container.querySelector("#roster-list").innerHTML = course.students
      .map((student) => {
        const confirmation = session.confirmations.find((c) => c.studentId === student.id);
        const badge = confirmation
          ? `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800">
               ${t("teacher.session.confirmedAt", { time: formatTime(confirmation.confirmedAt) })}
             </span>`
          : `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">${t("teacher.session.pending")}</span>`;
        return `<li class="flex items-center justify-between py-2">
                  <span class="text-sm text-slate-800">${escapeHtml(student.name)}</span>${badge}
                </li>`;
      })
      .join("");
  }

  render(session);

  const pollHandle = setInterval(async () => {
    try {
      const latest = await api.getSessionStatus(sessionId);
      render(latest);
      if (latest.status !== "active") clearInterval(pollHandle);
    } catch {
      // keep the last state on screen and try again on the next tick
    }
  }, 2000);

  container.querySelector("#end-session-btn").addEventListener("click", async () => {
    try {
      render(await api.endSession(sessionId));
      clearInterval(pollHandle);
    } catch (err) {
      alert(err.message);
    }
  });

  return () => clearInterval(pollHandle);
}
