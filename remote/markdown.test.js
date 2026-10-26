import { describe, expect, it } from "vitest";
import { escapeHtml, renderMarkdown } from "./markdown.js";

describe("renderMarkdown", () => {
  it("escapes raw HTML", () => {
    expect(escapeHtml('<script>x</script>')).toBe("&lt;script&gt;x&lt;/script&gt;");
    expect(renderMarkdown("Hello <b>x</b>")).toContain("&lt;b&gt;");
  });

  it("renders headings, lists, and CHECK markers", () => {
    const html = renderMarkdown("# Title\n\n- one\n- two\n\nConfirm [CHECK] this.");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain('class="remote-check"');
  });
});
