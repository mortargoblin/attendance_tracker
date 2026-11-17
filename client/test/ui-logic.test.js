// the pure parts of the page modules and the small shared modules.

import "./helpers/browser-stubs.js";
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { initI18n, setLanguage, t } from "../js/i18n.js";
import { escapeHtml } from "../js/html.js";
import { badge, STATUSES } from "../js/attendance-status.js";
import { redirectFor } from "../js/route-guard.js";
import { acceptLanguage } from "../js/api.js";
import { setSession, getSession, getCurrentUser, clearSession } from "../js/store.js";
import { normalizeCode } from "../js/pages/student-confirm.js";
import { sessionState } from "../js/pages/teacher-session.js";

before(async () => {
  await initI18n();
  await setLanguage("en");
});

describe("escapeHtml", () => {
  test("escapes the five html special characters", () => {
    assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });

  test("converts non-strings", () => {
    assert.equal(escapeHtml(42), "42");
  });

  test("leaves non-latin text alone", () => {
    assert.equal(escapeHtml("سارا محمدی · 山田 · Петров"), "سارا محمدی · 山田 · Петров");
  });
});

describe("badge", () => {
  test("each status has its own label and colour", () => {
    const labels = new Set(STATUSES.map((s) => badge(s).label));
    assert.equal(labels.size, STATUSES.length);
    assert.equal(badge("late").label, t("status.late.label"));
  });

  test("unknown status shows as absent", () => {
    assert.deepEqual(badge("weird"), badge("absent"));
  });
});

describe("redirectFor", () => {
  const routes = { "/login": {}, "/student": { role: "student" }, "/teacher": { role: "teacher" } };
  const student = { role: "student" };
  const teacher = { role: "teacher" };

  test("logged out: role pages go to login", () => {
    assert.equal(redirectFor("/teacher", routes["/teacher"], null), "/login");
  });

  test("logged out: login is allowed", () => {
    assert.equal(redirectFor("/login", routes["/login"], null), null);
  });

  test("wrong role goes home", () => {
    assert.equal(redirectFor("/teacher", routes["/teacher"], student), "/student");
  });

  test("right role is allowed", () => {
    assert.equal(redirectFor("/teacher", routes["/teacher"], teacher), null);
  });

  test("logged in user skips login", () => {
    assert.equal(redirectFor("/login", routes["/login"], teacher), "/teacher");
  });

  test("unknown path goes home", () => {
    assert.equal(redirectFor("/nope", undefined, student), "/student");
    assert.equal(redirectFor("", undefined, null), "/login");
  });
});

describe("acceptLanguage", () => {
  test("ui language first, english as fallback", () => {
    assert.equal(acceptLanguage("fi"), "fi, en;q=0.5");
    assert.equal(acceptLanguage("en"), "en");
  });
});

describe("store", () => {
  test("keeps only the user fields the ui needs", () => {
    setSession({ token: "abc", user: { id: 1, name: "Иван", email: "i@x", role: "student", extra: "x" } });
    assert.deepEqual(getSession(), { token: "abc", user: { id: 1, name: "Иван", email: "i@x", role: "student" } });
    assert.equal(getCurrentUser().name, "Иван");
    clearSession();
    assert.equal(getCurrentUser(), null);
  });

  test("corrupt storage reads as logged out", () => {
    sessionStorage.setItem("att_auth", "{not json");
    assert.equal(getSession(), null);
    clearSession();
  });
});

describe("normalizeCode", () => {
  test("keeps two ascii digits", () => {
    assert.equal(normalizeCode("4a2b7"), "42");
  });

  test("converts farsi digits", () => {
    assert.equal(normalizeCode("۰۷"), "07");
  });
});

describe("sessionState", () => {
  test("active session counts down and can be ended", () => {
    const state = sessionState({ status: "active", expiresAt: 125000 }, 0);
    assert.equal(state.canEnd, true);
    assert.equal(state.line, t("teacher.session.activeExpiresIn", { time: "2:05" }));
  });

  test("expired and ended sessions can't be ended again", () => {
    const expired = sessionState({ status: "expired", expiresAt: 0 }, 1);
    const ended = sessionState({ status: "ended", expiresAt: 0 }, 1);
    assert.equal(expired.canEnd, false);
    assert.equal(ended.canEnd, false);
    assert.equal(expired.button, t("teacher.session.expiredButton"));
    assert.equal(ended.line, t("teacher.session.ended"));
  });
});
