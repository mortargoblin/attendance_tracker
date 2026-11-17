import * as api from "../api.js";
import { escapeHtml } from "../html.js";
import { t, formatTime, toAsciiDigits } from "../i18n.js";
import { backLink, showMessage, hideMessage } from "../ui.js";

/** codes are two digits; the server compares them as ascii strings */
const CODE_LENGTH = 2;

/**
 * keeps only ascii digits (after converting persian/arabic ones), at most
 * CODE_LENGTH of them.
 * @param {string} value what the student typed
 */
export function normalizeCode(value) {
  return toAsciiDigits(value).replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/**
 * where a student types the code their teacher shows for a course.
 * @param {HTMLElement} container
 * @param {URLSearchParams} params courseId
 */
export async function renderConfirm(container, params) {
  const courseId = params.get("courseId");
  // students can only look up their own courses, so find it in that list
  const course = (await api.listCourses()).find((c) => String(c.id) === courseId);
  if (!course) throw new Error(t("server.courseNotFound"));

  container.innerHTML = `
    ${backLink("#/student")}
    <form id="confirm-form" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mt-4 space-y-4 text-center">
      <p class="text-sm text-slate-500">${escapeHtml(course.name)}</p>
      <label for="code" class="text-lg font-semibold text-slate-900 block">${t("student.confirm.prompt")}</label>
      <input
        class="w-full max-w-[12rem] mx-auto rounded-xl border-2 border-slate-300 px-4 py-4 text-center text-4xl font-mono tracking-[0.4em]"
        type="text" id="code" dir="ltr" inputmode="numeric" pattern="[0-9]{${CODE_LENGTH}}" maxlength="${CODE_LENGTH}" placeholder="00" autocomplete="off" required
      >
      <button type="submit" class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">${t("student.confirm.submit")}</button>
      <p id="message" class="mt-2" hidden></p>
    </form>
  `;

  const form = container.querySelector("#confirm-form");
  const codeInput = container.querySelector("#code");
  const message = container.querySelector("#message");

  codeInput.addEventListener("input", () => {
    codeInput.value = normalizeCode(codeInput.value);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(message);
    try {
      const result = await api.confirmAttendanceByCode(course.id, codeInput.value.padStart(CODE_LENGTH, "0"));
      const textParams = { course: result.courseName, time: formatTime(result.confirmedAt) };
      const key = result.alreadyConfirmed ? "student.confirm.alreadyConfirmed" : "student.confirm.confirmed";
      showMessage(message, t(key, textParams), "success");
      form.reset();
    } catch (err) {
      showMessage(message, err.message);
    }
  });
}
