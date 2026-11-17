// localization: ui strings live in locales/<lang>.json, numbers and dates are
// formatted with the browser's built-in intl api. see LOCALIZATION.md.
//
// usage in a page:  t("login.heading")
//                   t("common.studentCount", { count: 3 })
//                   formatDate(ms), formatNumber(n), formatPercent(0.75)

// every supported language, with its name written in that language (so
// someone who can't read the current ui can still find their own).
export const LANGUAGES = {
  en: { name: "English", dir: "ltr" },
  fi: { name: "Suomi", dir: "ltr" },
  fa: { name: "فارسی", dir: "rtl" },
  ja: { name: "日本語", dir: "ltr" },
  ru: { name: "Русский", dir: "ltr" },
  mn: { name: "Монгол", dir: "ltr" },
};

const DEFAULT_LANG = "en";
const STORAGE_KEY = "att_lang";

let lang = DEFAULT_LANG;
let messages = {};
let fallback = {};

/** fetches locales/<code>.json; throws if the file is missing. */
async function loadMessages(code) {
  const response = await fetch(new URL(`../locales/${code}.json`, import.meta.url));
  if (!response.ok) throw new Error(`Missing translations for "${code}".`);
  return response.json();
}

// picks the saved language, else the browser's, else english
function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved in LANGUAGES) return saved;
  } catch {
    // storage blocked (private window etc.); just use the browser language
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag.toLowerCase().split("-")[0];
    if (code in LANGUAGES) return code;
  }
  return DEFAULT_LANG;
}

/** loads english (the fallback) and the starting language. call once before the first render. */
export async function initI18n() {
  fallback = await loadMessages(DEFAULT_LANG);
  await setLanguage(initialLanguage(), { save: false });
}

/** @returns {string} the current language code, e.g. "fi" */
export function getLanguage() {
  return lang;
}

/**
 * switches the ui language: loads its strings, sets <html lang dir>, and
 * re-translates the static data-i18n elements. unknown codes become english.
 * @param {string} code
 * @param {{ save?: boolean }} [options] save: remember the choice in localstorage
 */
export async function setLanguage(code, { save = true } = {}) {
  if (!(code in LANGUAGES)) code = DEFAULT_LANG;
  messages = code === DEFAULT_LANG ? fallback : await loadMessages(code);
  lang = code;
  if (save) {
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // not saved; the choice still applies until the tab is closed
    }
  }
  document.documentElement.lang = code;
  document.documentElement.dir = LANGUAGES[code].dir;
  // static text in index.html is marked with data-i18n="<key>"
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.title = t("app.title");
}

// looks up a key in the current language, then english, then gives the key
// itself back (so a missing translation is visible instead of blank).
// "{name}" placeholders are filled from params. if the entry is an object of
// plural forms ({ one, few, many, other }), params.count picks the form using
// the language's own plural rules.
/**
 * @param {string} key e.g. "login.heading"
 * @param {Record<string, string | number>} [params] numbers are formatted for the locale
 * @returns {string}
 */
export function t(key, params = {}) {
  let entry = messages[key] ?? fallback[key] ?? key;
  if (typeof entry === "object") {
    const form = new Intl.PluralRules(lang).select(params.count ?? 0);
    entry = entry[form] ?? entry.other;
  }
  return entry.replace(/\{(\w+)\}/g, (match, name) => {
    if (!(name in params)) return match;
    const value = params[name];
    return typeof value === "number" ? formatNumber(value) : String(value);
  });
}

// --- numbers and dates, in the current language's own digits and calendar ---

/** @param {number} n @param {Intl.NumberFormatOptions} [options] */
export function formatNumber(n, options) {
  return new Intl.NumberFormat(lang, options).format(n);
}

// ratio is 0..1, e.g. 0.75 -> "75%" / "٪۷۵"
export function formatPercent(ratio) {
  return new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(ratio);
}

/** @param {number} ms since epoch @param {Intl.DateTimeFormatOptions} [options] */
export function formatDate(ms, options = { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) {
  return new Intl.DateTimeFormat(lang, options).format(new Date(ms));
}

/** @param {number} ms since epoch, shown as hours:minutes */
export function formatTime(ms) {
  return new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
}

/**
 * a remaining time as "m:ss" in the current language's digits, e.g. 754000
 * -> "12:34" (or "۱۲:۳۴" in farsi). negative times show as 0:00.
 * @param {number} ms
 */
export function formatCountdown(ms) {
  const totalSecs = Math.floor(Math.max(0, ms) / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${formatNumber(mins)}:${formatNumber(secs, { minimumIntegerDigits: 2 })}`;
}

// --- user input ---

/**
 * persian (۰-۹) and arabic-indic (٠-٩) digits typed on a farsi/arabic
 * keyboard become 0-9, since the server compares plain ascii codes.
 * @param {string} value
 */
export function toAsciiDigits(value) {
  // both digit ranges end in 0..9 in their low four bits (U+06F0, U+0660)
  return value.replace(/[۰-۹٠-٩]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

// --- server error messages ---

// the server answers in english; known messages are mapped to translation
// keys here, anything else is shown as-is.
// the server's course name limit (courses.name is VARCHAR(160))
const COURSE_NAME_MAX = 160;

const SERVER_ERRORS = {
  "All attendance codes are in use right now. Try again in a few minutes.": "server.codesInUse",
  "An account with that email already exists.": "server.emailTaken",
  "Course name is required.": "server.courseNameRequired",
  "Course name must be at most 160 characters.": "server.courseNameTooLong",
  "Course not found.": "server.courseNotFound",
  "Enter a valid email address.": "server.invalidEmail",
  "Enter the code shown on the screen.": "server.codeRequired",
  "Incorrect email or password.": "server.badLogin",
  "Name is required.": "server.nameRequired",
  "Name is too long.": "server.nameTooLong",
  "One or more of the selected students don't exist.": "server.unknownStudents",
  "Password is too long.": "server.passwordTooLong",
  "Role must be student or teacher.": "server.invalidRole",
  "Session not found.": "server.sessionNotFound",
  "That code doesn't match an active session for this course.": "server.codeNoMatch",
  "The request body is not valid JSON.": "server.invalidJson",
  "This code has expired.": "server.codeExpired",
  "You already have a course with that name.": "server.courseNameTaken",
  "You don't have permission to do that.": "server.forbidden",
  "Your session has expired. Please log in again.": "server.sessionExpired",
};

/**
 * the server's english error text in the current language.
 * @param {string} message
 */
export function translateServerError(message) {
  // max is only used by server.courseNameTooLong
  if (message in SERVER_ERRORS) return t(SERVER_ERRORS[message], { max: COURSE_NAME_MAX });
  const minLength = /^Password must be at least (\d+) characters\.$/.exec(message);
  if (minLength) return t("server.passwordTooShort", { count: Number(minLength[1]) });
  return message;
}
