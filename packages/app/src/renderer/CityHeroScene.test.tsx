import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CityHeroScene } from "./CityHeroScene";

afterEach(cleanup);

describe("CityHeroScene", () => {
  it("renders without throwing when there is no real WebGL context (this project's test environment)", () => {
    // jsdom has no `canvas` package installed, so `getContext("webgl"/"webgl2")`
    // always returns null here -- the same condition `three.js`'s own
    // `WebGLRenderer` constructor throws on. This is a decorative homepage
    // backdrop, not a feature: it should quietly render nothing rather than
    // crash the page. See the component's own feature-detection comment.
    expect(() => render(<CityHeroScene />)).not.toThrow();
  });

  it("unmounts cleanly", () => {
    const { unmount } = render(<CityHeroScene />);
    expect(() => unmount()).not.toThrow();
  });
});
