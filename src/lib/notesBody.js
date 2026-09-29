const HTML_START = /^\s*<(p|h[1-6]|ul|ol|div|blockquote|pre|hr|table)[\s>/]/i;

export function isHtmlBody(body) {
  return HTML_START.test(String(body || ""));
}

export function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function plainTextToHtml(text) {
  const value = String(text || "");
  if (!value.trim()) return "";
  return value
    .split(/\n{2,}/)
    .map((chunk) => `<p>${escapeHtml(chunk).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Notes bodies may be legacy plain text or TipTap HTML; always hand the editor HTML. */
export function bodyToHtml(body) {
  return isHtmlBody(body) ? String(body) : plainTextToHtml(body);
}

export function htmlToPlainText(body) {
  const value = String(body || "");
  if (!isHtmlBody(value)) return value;
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|div|blockquote|pre)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Append plain text to a notes body, preserving HTML formatting if present. */
export function appendPlainText(body, text, { prepend = false } = {}) {
  const addition = String(text || "").trim();
  if (!addition) return body || "";
  const current = String(body || "");
  if (!current.trim()) return plainTextToHtml(addition);
  const currentHtml = bodyToHtml(current);
  const additionHtml = plainTextToHtml(addition);
  return prepend ? `${additionHtml}${currentHtml}` : `${currentHtml}${additionHtml}`;
}
