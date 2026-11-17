import "./helpers/browser-stubs.js";
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import {
  LANGUAGES,
  initI18n,
  setLanguage,
  getLanguage,
  t,
  formatNumber,
  formatPercent,
  formatCountdown,
  toAsciiDigits,
  translateServerError,
} from "../js/i18n.js";

before(async () => {
  await initI18n();
});

describe("setLanguage", () => {
  test("sets lang and dir on <html>, rtl for farsi", async () => {
    await setLanguage("fa");
    assert.equal(getLanguage(), "fa");
    assert.equal(document.documentElement.lang, "fa");
    assert.equal(document.documentElement.dir, "rtl");
    await setLanguage("ja");
    assert.equal(document.documentElement.dir, "ltr");
  });

  test("unknown code falls back to english", async () => {
    await setLanguage("xx");
    assert.equal(getLanguage(), "en");
  });

  test("saves the choice", async () => {
    await setLanguage("ru");
    assert.equal(localStorage.getItem("att_lang"), "ru");
  });

  test("document title is translated", async () => {
    await setLanguage("fi");
    assert.equal(document.title, t("app.title"));
  });
});

describe("t", () => {
  test("fills placeholders", async () => {
    await setLanguage("en");
    assert.equal(t("common.sessionNumber", { n: 3 }), "Session #3");
  });

  test("missing key shows the key itself", async () => {
    await setLanguage("fi");
    assert.equal(t("no.such.key"), "no.such.key");
  });

  test("unknown placeholder is left as is", async () => {
    await setLanguage("en");
    assert.equal(t("common.sessionNumber"), "Session #{n}");
  });

  test("english plural forms", async () => {
    await setLanguage("en");
    assert.equal(t("common.studentCount", { count: 1 }), "1 student");
    assert.equal(t("common.studentCount", { count: 2 }), "2 students");
  });

  test("russian uses one / few / many", async () => {
    await setLanguage("ru");
    const one = t("common.sessionCount", { count: 1 });
    const few = t("common.sessionCount", { count: 3 });
    const many = t("common.sessionCount", { count: 5 });
    const one21 = t("common.sessionCount", { count: 21 });
    assert.notEqual(one, few);
    assert.notEqual(few, many);
    // 21 takes the same form as 1 in russian
    assert.equal(one21.replace(/\d+/, "N"), one.replace(/\d+/, "N"));
  });

  test("numbers in placeholders use persian digits in farsi", async () => {
    await setLanguage("fa");
    assert.match(t("common.sessionNumber", { n: 42 }), /۴۲/);
  });
});

describe("formatting", () => {
  test("formatNumber follows the language", async () => {
    await setLanguage("fa");
    assert.equal(formatNumber(1234), "۱٬۲۳۴");
    await setLanguage("en");
    assert.equal(formatNumber(1234), "1,234");
  });

  test("formatPercent rounds to whole percent", async () => {
    await setLanguage("en");
    assert.equal(formatPercent(0.756), "76%");
  });

  test("formatCountdown is m:ss", async () => {
    await setLanguage("en");
    assert.equal(formatCountdown(12 * 60000 + 34000 + 999), "12:34");
    assert.equal(formatCountdown(5000), "0:05");
    assert.equal(formatCountdown(-1000), "0:00");
  });

  test("formatCountdown in farsi digits", async () => {
    await setLanguage("fa");
    assert.equal(formatCountdown(65000), "۱:۰۵");
  });
});

describe("toAsciiDigits", () => {
  test("persian and arabic-indic digits", () => {
    assert.equal(toAsciiDigits("۴۲"), "42");
    assert.equal(toAsciiDigits("٠٩"), "09");
    assert.equal(toAsciiDigits("۰۱۲۳۴۵۶۷۸۹"), "0123456789");
  });

  test("leaves other text alone", () => {
    assert.equal(toAsciiDigits("a1b"), "a1b");
  });
});

describe("translateServerError", () => {
  test("known message is translated", async () => {
    await setLanguage("fi");
    assert.equal(translateServerError("Course not found."), t("server.courseNotFound"));
    assert.notEqual(translateServerError("Course not found."), "Course not found.");
  });

  test("course name limit is filled in", async () => {
    await setLanguage("en");
    assert.match(translateServerError("Course name must be at most 160 characters."), /160/);
  });

  test("password length message uses plural rules", async () => {
    await setLanguage("en");
    assert.equal(translateServerError("Password must be at least 6 characters."), "Password must be at least 6 characters.");
    assert.equal(translateServerError("Password must be at least 1 characters."), "Password must be at least 1 character.");
  });

  test("unknown message is shown unchanged", async () => {
    await setLanguage("ja");
    assert.equal(translateServerError("Something new."), "Something new.");
  });
});

test("every language has a name and a direction", () => {
  for (const [code, { name, dir }] of Object.entries(LANGUAGES)) {
    assert.ok(name, code);
    assert.ok(dir === "ltr" || dir === "rtl", code);
  }
});
