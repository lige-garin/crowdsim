import { describe, expect, it } from "vitest";
import { toggleUrlFlag } from "./urlFlagToggle";

describe("toggleUrlFlag", () => {
  it("adds the flag when it is absent", () => {
    const result = toggleUrlFlag("https://example.test/app?other=1", "gpumove");
    expect(new URL(result).searchParams.has("gpumove")).toBe(true);
    expect(new URL(result).searchParams.get("other")).toBe("1");
  });

  it("removes the flag when it is present", () => {
    const result = toggleUrlFlag("https://example.test/app?gpumove&other=1", "gpumove");
    expect(new URL(result).searchParams.has("gpumove")).toBe(false);
    expect(new URL(result).searchParams.get("other")).toBe("1");
  });

  it("round-trips back to the original flag state after two toggles", () => {
    const start = "https://example.test/app?scene=x";
    const once = toggleUrlFlag(start, "gpumove");
    const twice = toggleUrlFlag(once, "gpumove");
    expect(new URL(twice).searchParams.has("gpumove")).toBe(false);
  });

  it("leaves every other query parameter untouched", () => {
    const result = toggleUrlFlag(
      "https://example.test/app?mainsim&scene=demo&lang=zh",
      "gpumove",
    );
    const params = new URL(result).searchParams;
    expect(params.has("mainsim")).toBe(true);
    expect(params.get("scene")).toBe("demo");
    expect(params.get("lang")).toBe("zh");
  });
});
