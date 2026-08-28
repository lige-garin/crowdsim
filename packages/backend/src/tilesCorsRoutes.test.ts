import { InMemoryProjectStore } from "@crowdsim/collab";
import { describe, expect, it } from "vitest";
import { createCrowdSimBackend } from "./index";
import {
  login,
  requestJson,
  type ErrorPayload,
  type QuotaPayload,
  type UsagePayload,
} from "./backendTestUtils";

describe("CrowdSim backend tile and CORS routes", () => {
  it("blocks client-side tile keys and reports missing server tile secrets", async () => {
    const backend = createCrowdSimBackend();
    const token = await login(backend.fetch, "planner");
    const leakedSecret = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/tiles/google/tileset.json?key=browser-key",
      { token },
    );
    const missingServerSecret = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/tiles/google/tileset.json",
      { token },
    );

    expect(leakedSecret.status).toBe(400);
    expect(leakedSecret.body.error).toBe("client-secret-blocked");
    expect(missingServerSecret.status).toBe(503);
    expect(missingServerSecret.body.error).toBe("tiles-secret-missing");
  });

  it("proxies Google tiles through a server-side key without leaking it", async () => {
    let upstreamRequestUrl = "";
    const backend = createCrowdSimBackend({
      tiles: {
        fetch: async (request) => {
          upstreamRequestUrl = request.url;

          return new Response(JSON.stringify({ root: true }), {
            headers: { "content-type": "application/json" },
          });
        },
        googleApiKey: "server-google-tiles-key",
        upstreamBaseUrl: "https://tiles.example/v1/3dtiles",
      },
    });
    const token = await login(backend.fetch, "planner");

    const response = await requestJson<{ root: boolean }>(
      backend.fetch,
      "/api/tiles/google/tileset.json?session=demo",
      { token },
    );
    const usage = await requestJson<UsagePayload>(backend.fetch, "/api/usage/planner", {
      token,
    });

    expect(response.status).toBe(200);
    expect(response.body.root).toBe(true);
    expect(upstreamRequestUrl).toBe(
      "https://tiles.example/v1/3dtiles/tileset.json?session=demo&key=server-google-tiles-key",
    );
    expect(JSON.stringify(response.body)).not.toContain("server-google-tiles-key");
    expect(usage.body.usage.usage["tiles-requests"]).toBe(1);
  });

  it("returns 429 once the tiles quota is exhausted", async () => {
    let upstreamCalls = 0;
    const backend = createCrowdSimBackend({
      store: new InMemoryProjectStore({ usageLimits: { "tiles-requests": 1 } }),
      tiles: {
        fetch: async () => {
          upstreamCalls++;

          return new Response("{}", {
            headers: { "content-type": "application/json" },
          });
        },
        googleApiKey: "server-google-tiles-key",
      },
    });
    const token = await login(backend.fetch, "planner");

    const first = await requestJson(backend.fetch, "/api/tiles/google/tileset.json", {
      token,
    });
    const second = await requestJson<QuotaPayload>(
      backend.fetch,
      "/api/tiles/google/tileset.json",
      { token },
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.metric).toBe("tiles-requests");
    expect(upstreamCalls).toBe(1);
  });

  it("answers CORS preflight only for configured origins", async () => {
    const allowedOrigin = "https://studio.crowdsim.local";
    const backend = createCrowdSimBackend({
      cors: { allowCredentials: true, allowedOrigins: [allowedOrigin] },
    });

    const preflight = await backend.fetch(
      new Request("https://crowdsim.local/api/projects", {
        headers: {
          "access-control-request-headers": "authorization",
          "access-control-request-method": "POST",
          origin: allowedOrigin,
        },
        method: "OPTIONS",
      }),
    );
    const foreignPreflight = await backend.fetch(
      new Request("https://crowdsim.local/api/projects", {
        headers: {
          origin: "https://evil.example",
          "access-control-request-method": "POST",
        },
        method: "OPTIONS",
      }),
    );
    const allowedGet = await backend.fetch(
      new Request("https://crowdsim.local/health", {
        headers: { origin: allowedOrigin },
      }),
    );
    const foreignGet = await backend.fetch(
      new Request("https://crowdsim.local/health", {
        headers: { origin: "https://evil.example" },
      }),
    );
    const unauthorized = await backend.fetch(
      new Request("https://crowdsim.local/api/projects", {
        headers: { origin: allowedOrigin },
      }),
    );

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "authorization",
    );
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    expect(foreignPreflight.status).toBe(403);
    expect(foreignPreflight.headers.get("access-control-allow-origin")).toBeNull();
    expect(allowedGet.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    expect(allowedGet.headers.get("vary")).toBe("Origin");
    expect(foreignGet.headers.get("access-control-allow-origin")).toBeNull();
    // Error responses must carry the headers too, or the browser hides the 401.
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
  });

  it("stays same-origin by default and refuses wildcard credentials", async () => {
    const backend = createCrowdSimBackend();
    const crossOrigin = await backend.fetch(
      new Request("https://crowdsim.local/health", {
        headers: { origin: "https://studio.crowdsim.local" },
      }),
    );
    const preflight = await backend.fetch(
      new Request("https://crowdsim.local/api/projects", {
        headers: { origin: "https://studio.crowdsim.local" },
        method: "OPTIONS",
      }),
    );

    expect(crossOrigin.status).toBe(200);
    expect(crossOrigin.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.status).toBe(403);
    expect(() =>
      createCrowdSimBackend({
        cors: { allowCredentials: true, allowedOrigins: ["*"] },
      }),
    ).toThrow(/wildcard origin/i);
  });
});
