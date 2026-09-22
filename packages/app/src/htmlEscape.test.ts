import { describe, expect, it } from "vitest";
import { escapeHtml } from "./htmlEscape";

describe("escapeHtml", () => {
  it("escapes the five characters that matter for safe HTML interpolation", () => {
    expect(escapeHtml(`<script>alert("x")&'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&amp;&#039;y&#039;&lt;/script&gt;",
    );
  });

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("Baseline layout")).toBe("Baseline layout");
  });
});
