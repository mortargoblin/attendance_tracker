import * as api from "../api.js";
import { escapeHtml } from "../html.js";

export async function renderConfirm(container, params) {
  const courseId = params.get("courseId");
  // students can only look up their own courses, so find it in that list
  const course = (await api.listCourses()).find((c) => String(c.id) === courseId);
  if (!course) throw new Error("Course not found.");

  container.innerHTML = `
    <a href="#/student" class="text-sm text-indigo-600 hover:underline">&larr; Back to courses</a>
    <form id="confirm-form" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mt-4 space-y-4 text-center">
      <p class="text-sm text-slate-500">${escapeHtml(course.name)}</p>
      <label for="code" class="text-lg font-semibold text-slate-900 block">Enter the code your teacher is showing</label>
      <input
        class="w-full max-w-[12rem] mx-auto rounded-xl border-2 border-slate-300 px-4 py-4 text-center text-4xl font-mono tracking-[0.4em]"
        type="text" id="code" inputmode="numeric" pattern="[0-9]{2}" maxlength="2" placeholder="00" autocomplete="off" required
      >
      <button type="submit" class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">Confirm attendance</button>
      <p id="message" hidden></p>
    </form>
  `;

  const codeInput = container.querySelector("#code");
  const message = container.querySelector("#message");

  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 2);
  });

  container.querySelector("#confirm-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    message.hidden = true;
    try {
      const result = await api.confirmAttendanceByCode(course.id, codeInput.value.padStart(2, "0"));
      const time = new Date(result.confirmedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      message.className = "mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700";
      message.textContent = result.alreadyConfirmed
        ? `You're already marked present for ${result.courseName} (confirmed at ${time}).`
        : `You're marked present for ${result.courseName} — ${time}.`;
      message.hidden = false;
      container.querySelector("#confirm-form").reset();
    } catch (err) {
      message.className = "mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700";
      message.textContent = err.message;
      message.hidden = false;
    }
  });
}
