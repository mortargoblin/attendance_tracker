// small view helpers shared by the pages, so the same markup and the same
// show-an-error code aren't copied into every page module.

import { t } from "./i18n.js";

const MESSAGE_CLASSES = {
  error: "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700",
  success: "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700",
};

/**
 * the "← back to courses" link at the top of a sub-page. the arrow is
 * mirrored in right-to-left languages so it still points backwards.
 * @param {string} href hash route to go back to, e.g. "#/teacher"
 * @returns {string} html
 */
export function backLink(href) {
  return `<a href="${href}" class="text-sm text-indigo-600 hover:underline"><span class="inline-block rtl:-scale-x-100">&larr;</span> ${t("common.backToCourses")}</a>`;
}

/**
 * shows text in a page's `<p hidden>` message element. uses textContent, so
 * user data inside an error message can't inject html.
 * @param {HTMLElement} el
 * @param {string} text
 * @param {"error" | "success"} [kind]
 */
export function showMessage(el, text, kind = "error") {
  // swap only the look; layout classes such as mt-3 on the element stay
  for (const classes of Object.values(MESSAGE_CLASSES)) el.classList.remove(...classes.split(" "));
  el.classList.add(...MESSAGE_CLASSES[kind].split(" "));
  el.textContent = text;
  el.hidden = false;
}

/** @param {HTMLElement} el message element shown with showMessage() */
export function hideMessage(el) {
  el.hidden = true;
}

/**
 * makes the browser save a blob as a file.
 * @param {Blob} blob
 * @param {string} fileName
 */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
