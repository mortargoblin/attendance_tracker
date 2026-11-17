import * as api from "../api.js";
import { escapeHtml } from "../html.js";
import { t, formatTime, formatCountdown } from "../i18n.js";
import { backLink, showMessage, hideMessage } from "../ui.js";

/** how often the page asks the server who has confirmed so far */
const POLL_INTERVAL_MS = 2000;

/**
 * the status line and end button text for a session state.
 * @param {{ status: "active" | "expired" | "ended", expiresAt: number }} session
 * @param {number} now ms since epoch
 * @returns {{ line: string, button: string, canEnd: boolean }}
 */
export function sessionState(session, now) {
  if (session.status === "active") {
    return {
      line: t("teacher.session.activeExpiresIn", { time: formatCountdown(session.expiresAt - now) }),
      button: t("teacher.session.end"),
      canEnd: true,
    };
  }
  const expired = session.status === "expired";
  return {
    line: t(expired ? "teacher.session.expired" : "teacher.session.ended"),
    button: t(expired ? "teacher.session.expiredButton" : "teacher.session.endedButton"),
    canEnd: false,
  };
}

/** a roster row: the student's name and either their confirm time or a mark-present button */
function rosterRow(student, confirmation) {
  const right = confirmation
    ? `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800">
         ${t("teacher.session.confirmedAt", { time: formatTime(confirmation.confirmedAt) })}
       </span>`
    : `<span class="inline-flex items-center gap-2">
         <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">${t("teacher.session.pending")}</span>
         <button data-mark="${student.id}" class="rounded-lg border border-indigo-300 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50">${t("teacher.session.markPresent")}</button>
       </span>`;
  return `<li class="flex items-center justify-between py-2">
            <span class="text-sm text-slate-800">${escapeHtml(student.name)}</span>${right}
          </li>`;
}

/**
 * the live view of a running session: the big code, a countdown and the
 * roster, refreshed every POLL_INTERVAL_MS until the session stops.
 * @param {HTMLElement} container
 * @param {URLSearchParams} params sessionId
 * @returns {Promise<() => void>} cleanup: stops polling
 */
export async function renderTeacherSession(container, params) {
  const sessionId = params.get("sessionId");
  const session = await api.getSessionStatus(sessionId);
  const course = await api.getCourse(session.courseId);

  // the code itself stays in ascii digits and left-to-right: it's what
  // students type, whatever language either side is using
  container.innerHTML = `
    ${backLink("#/teacher")}
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
    <p id="message" class="mt-4" hidden></p>
    <button id="end-session-btn" class="w-full mt-4 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">${t("teacher.session.end")}</button>
  `;

  const codeEl = container.querySelector("#session-code");
  const statusLine = container.querySelector("#status-line");
  const summary = container.querySelector("#roster-summary");
  const rosterList = container.querySelector("#roster-list");
  const endBtn = container.querySelector("#end-session-btn");
  const message = container.querySelector("#message");

  function render(current) {
    codeEl.textContent = current.code;

    const state = sessionState(current, Date.now());
    statusLine.textContent = state.line;
    endBtn.textContent = state.button;
    endBtn.disabled = !state.canEnd;

    const confirmations = new Map(current.confirmations.map((c) => [c.studentId, c]));
    summary.textContent = t("teacher.session.confirmedCount", {
      confirmed: confirmations.size,
      total: course.students.length,
    });
    rosterList.innerHTML = course.students.map((student) => rosterRow(student, confirmations.get(student.id))).join("");
  }

  rosterList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-mark]");
    if (!btn) return;
    btn.disabled = true;
    hideMessage(message);
    try {
      render(await api.markStudentPresent(sessionId, btn.dataset.mark));
    } catch (err) {
      showMessage(message, err.message);
      btn.disabled = false;
    }
  });

  render(session);

  const pollHandle = setInterval(async () => {
    try {
      const latest = await api.getSessionStatus(sessionId);
      render(latest);
      if (latest.status !== "active") clearInterval(pollHandle);
    } catch {
      // keep the last state on screen and try again on the next tick
    }
  }, POLL_INTERVAL_MS);

  endBtn.addEventListener("click", async () => {
    hideMessage(message);
    try {
      render(await api.endSession(sessionId));
      clearInterval(pollHandle);
    } catch (err) {
      showMessage(message, err.message);
    }
  });

  return () => clearInterval(pollHandle);
}
