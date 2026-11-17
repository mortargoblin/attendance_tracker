// names, emails and course names come from other users, so anything put into
// innerHTML goes through this first to stop it being run as html/script.
/**
 * @param {unknown} value anything; it is converted with String()
 * @returns {string} the text with & < > " ' escaped
 */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
