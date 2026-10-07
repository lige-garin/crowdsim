import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The CSP is written out twice: once in `public/_headers`, which ships to the
 * host, and once in `docs/DEPLOYMENT.md`, which is what a person deploying
 * this actually copies. They have to say the same thing — a host recipe that
 * lags the shipped file is a deployment that breaks in a way the reader has
 * no way to anticipate.
 *
 * The second thing here is that the allowed origins have to be the ones the
 * code really talks to. The list was derived from source once and then fell
 * out of date the moment a second network call was added, which is exactly
 * how the Amap hosts came to be missing.
 */

// Resolved from the working directory vitest runs in (packages/app), which
// `import.meta.url` is not: under vite that is a `/@fs/` URL, and turning it
// back into a Windows path is where this went wrong the first time.
const appDir = process.cwd();

const shipped = readFileSync(`${appDir}/public/_headers`, "utf8");
const guide = readFileSync(`${appDir}/../../docs/DEPLOYMENT.md`, "utf8");

/** Whitespace collapsed, so a rewrapped policy does not read as a difference. */
const flat = (text: string) => text.replace(/\s+/g, " ");

/**
 * The policy as one line. It starts at `default-src` in both files and runs to
 * `base-uri 'self'`, which is the last directive and the only one ending
 * without a `;`. The Nginx recipe in the guide trails `" always;` after it —
 * server syntax, not part of the policy.
 */
const policyOf = (text: string) => {
  const start = text.indexOf("default-src");
  const end = text.indexOf("base-uri 'self'", start);

  return start < 0 || end < 0 ? "" : flat(text.slice(start, end + "base-uri 'self'".length));
};

const policy = policyOf(shipped);

describe("the Content-Security-Policy", () => {
  it("appears in the deployment guide exactly as it ships", () => {
    expect(policy).not.toBe("");
    expect(flat(guide)).toContain(policy);
  });

  it("allows the two hosts the code itself names", () => {
    // Sourced from the source, not from memory: MapPlacement.tsx loads the SDK
    // from webapi.amap.com and amapPoi.ts queries restapi.amap.com.
    for (const host of ["https://webapi.amap.com", "https://restapi.amap.com"]) {
      expect(policy, host).toContain(host);
    }
  });

  it("allows every cross-origin host the app's own source contacts", () => {
    // The check that would have caught the gap: walk the app's source for
    // absolute https URLs and require each host in `connect-src` or
    // `script-src`. A new integration that forgets the CSP fails here.
    const connectSrc = policy.match(/connect-src ([^;]*)/)?.[1] ?? "";
    const scriptSrc = policy.match(/script-src ([^;]*)/)?.[1] ?? "";
    const allowed = `${connectSrc} ${scriptSrc}`;

    for (const file of ["projects/MapPlacement.tsx", "projects/amapPoi.ts"]) {
      const text = readFileSync(`${appDir}/src/${file}`, "utf8");
      const hosts = new Set(
        [...text.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map((match) => match[1]),
      );

      expect(hosts.size, `${file} should name at least one host`).toBeGreaterThan(0);

      for (const host of hosts) {
        expect(allowed, `${host} (from ${file}) is not allowed by the CSP`).toContain(host);
      }
    }
  });
});
