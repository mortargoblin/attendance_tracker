import * as api from "../api.js";
import { escapeHtml } from "../html.js";
import { t, formatTime } from "../i18n.js";

// persian (۰-۹) and arabic-indic (٠-٩) digits typed on a farsi/arabic
// keyboard are turned into 0-9, since the server compares plain ascii codes
function toAsciiDigits(value) {
  return value.replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

export async function renderConfirm(container, params) {
  const courseId = params.get("courseId");
  // students can only look up their own courses, so find it in that list
  const course = (await api.listCourses()).find((c) => String(c.id) === courseId);
  if (!course) throw new Error(t("server.courseNotFound"));

  container.innerHTML = `
    <a href="#/student" class="text-sm text-indigo-600 hover:underline"><span class="inline-block rtl:-scale-x-100">&larr;</span> ${t("common.backToCourses")}</a>
    <form id="confirm-form" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mt-4 space-y-4 text-center">
      <p class="text-sm text-slate-500">${escapeHtml(course.name)}</p>
      <label for="code" class="text-lg font-semibold text-slate-900 block">${t("student.confirm.prompt")}</label>
      <input
        class="w-full max-w-[12rem] mx-auto rounded-xl border-2 border-slate-300 px-4 py-4 text-center text-4xl font-mono tracking-[0.4em]"
        type="text" id="code" dir="ltr" inputmode="numeric" pattern="[0-9]{2}" maxlength="2" placeholder="00" autocomplete="off" required
      >
      <button type="submit" class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">${t("student.confirm.submit")}</button>
      <p id="message" hidden></p>
    </form>
  `;

  const codeInput = container.querySelector("#code");
  const message = container.querySelector("#message");

  codeInput.addEventListener("input", () => {
    codeInput.value = toAsciiDigits(codeInput.value).replace(/\D/g, "").slice(0, 2);
  });

  container.querySelector("#confirm-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    message.hidden = true;
    try {
      const result = await api.confirmAttendanceByCode(course.id, codeInput.value.padStart(2, "0"));
      const params = { course: result.courseName, time: formatTime(result.confirmedAt) };
      message.className = "mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700";
      message.textContent = result.alreadyConfirmed
        ? t("student.confirm.alreadyConfirmed", params)
        : t("student.confirm.confirmed", params);
      message.hidden = false;
      container.querySelector("#confirm-form").reset();
    } catch (err) {
      message.className = "mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700";
      message.textContent = err.message;
      message.hidden = false;
    }
  });
}
