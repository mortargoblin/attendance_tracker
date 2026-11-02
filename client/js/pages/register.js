import * as api from "../api.js";
import { setSession } from "../store.js";
import { navigate } from "../router.js";
import { t } from "../i18n.js";

export async function renderRegister(container) {
  container.innerHTML = `
    <h1 class="text-2xl font-bold text-slate-900 text-center mb-6">${t("app.title")}</h1>
    <form id="register-form" class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <h2 class="text-lg font-semibold text-slate-900">${t("register.heading")}</h2>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1" for="name">${t("register.fullName")}</label>
        <input class="block w-full rounded-lg border border-slate-300 px-3 py-2" type="text" id="name" required autocomplete="name">
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1" for="email">${t("form.email")}</label>
        <input class="block w-full rounded-lg border border-slate-300 px-3 py-2" type="email" id="email" dir="ltr" required autocomplete="email">
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1" for="password">${t("form.password")}</label>
        <input class="block w-full rounded-lg border border-slate-300 px-3 py-2" type="password" id="password" required minlength="6" autocomplete="new-password">
      </div>
      <fieldset>
        <legend class="block text-sm font-medium text-slate-700 mb-1">${t("register.roleLegend")}</legend>
        <!-- no admin/invite flow to provision teacher accounts yet, so registration just asks. -->
        <div class="flex gap-4">
          <label class="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="role" value="student" checked> ${t("register.roleStudent")}
          </label>
          <label class="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="role" value="teacher"> ${t("register.roleTeacher")}
          </label>
        </div>
      </fieldset>
      <button type="submit" class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">${t("register.submit")}</button>
      <p id="message" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" hidden></p>
      <p class="text-sm text-slate-500 text-center">${t("register.haveAccount")} <a class="text-indigo-600 hover:underline" href="#/login">${t("register.loginLink")}</a></p>
    </form>
  `;

  const message = container.querySelector("#message");

  container.querySelector("#register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    message.hidden = true;
    try {
      const { token, user } = await api.register({
        name: container.querySelector("#name").value.trim(),
        email: container.querySelector("#email").value.trim(),
        password: container.querySelector("#password").value,
        role: container.querySelector('input[name="role"]:checked').value,
      });
      setSession({ token, user });
      navigate(`/${user.role}`);
    } catch (err) {
      message.textContent = err.message;
      message.hidden = false;
    }
  });
}
