import { describe, expect, it } from "vitest";
import { AuthSessionStore } from "./auth";
import { createCrowdSimBackend } from "./index";
import {
  requestJson,
  type AuthSessionPayload,
  type ErrorPayload,
  type ProjectsPayload,
} from "./backendTestUtils";

describe("CrowdSim backend auth routes", () => {
  it("creates, resolves, and revokes account sessions", async () => {
    const backend = createCrowdSimBackend({
      nowIso: () => "2026-06-12T00:00:00.000Z",
    });
    const login = await requestJson<AuthSessionPayload>(
      backend.fetch,
      "/api/auth/login",
      {
        body: {
          accountId: "planner",
          displayName: "Planner",
        },
        method: "POST",
      },
    );

    expect(login.status).toBe(201);
    expect(login.body.session.account).toEqual({
      displayName: "Planner",
      id: "planner",
    });
    expect(login.body.session.token).toMatch(/^csess_/);

    const session = await requestJson<AuthSessionPayload>(
      backend.fetch,
      "/api/auth/session",
      {
        token: login.body.session.token,
      },
    );
    expect(session.status).toBe(200);
    expect(session.body.session.account.id).toBe("planner");

    const logout = await requestJson<{ revoked: boolean }>(
      backend.fetch,
      "/api/auth/logout",
      {
        method: "POST",
        token: login.body.session.token,
      },
    );
    const afterLogout = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/auth/session",
      {
        token: login.body.session.token,
      },
    );

    expect(logout.body.revoked).toBe(true);
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.error).toBe("auth-session-not-found");
  });

  it("rejects expired account sessions", async () => {
    let nowIso = "2026-06-12T00:00:00.000Z";
    const backend = createCrowdSimBackend({
      nowIso: () => nowIso,
    });
    const login = await requestJson<AuthSessionPayload>(
      backend.fetch,
      "/api/auth/login",
      {
        body: { accountId: "planner" },
        method: "POST",
      },
    );

    nowIso = "2026-06-12T09:00:00.000Z";
    const expired = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/auth/session",
      {
        token: login.body.session.token,
      },
    );
    const expiredProjects = await requestJson<ErrorPayload>(
      backend.fetch,
      "/api/projects",
      { token: login.body.session.token },
    );

    expect(expired.status).toBe(401);
    expect(expired.body.error).toBe("auth-session-not-found");
    expect(expiredProjects.status).toBe(401);
    expect(expiredProjects.body.error).toBe("auth-required");
  });

  it("issues unpredictable session tokens decoupled from the account", async () => {
    const backend = createCrowdSimBackend({
      nowIso: () => "2026-06-12T00:00:00.000Z",
    });
    const tokens: string[] = [];

    for (let index = 0; index < 50; index++) {
      const login = await requestJson<AuthSessionPayload>(
        backend.fetch,
        "/api/auth/login",
        {
          body: { accountId: "planner" },
          method: "POST",
        },
      );
      tokens.push(login.body.session.token);
    }

    // Same account, same clock, 50 logins: nothing about the token may be a
    // function of the account id or the timestamp.
    expect(new Set(tokens).size).toBe(50);

    for (const token of tokens) {
      expect(token).not.toContain("planner");
      expect(token.replace(/^csess_/, "")).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("draws session tokens from the injected random source", () => {
    const issued: Uint8Array[] = [];
    const auth = new AuthSessionStore({
      randomBytes: (byteLength) => {
        const bytes = new Uint8Array(byteLength).fill(issued.length + 1);
        issued.push(bytes);

        return bytes;
      },
    });

    const session = auth.createSession({
      accountId: "planner",
      nowIso: "2026-06-12T00:00:00.000Z",
    });

    expect(issued[0]).toHaveLength(32);
    expect(session.token).toBe(`csess_${"01".repeat(32)}`);
    expect(
      auth.resolveSession(session.token, "2026-06-12T01:00:00.000Z")?.account.id,
    ).toBe("planner");
  });

  it("refuses to reuse a session token instead of overwriting the first session", () => {
    const auth = new AuthSessionStore({
      randomBytes: (byteLength) => new Uint8Array(byteLength).fill(7),
    });
    const first = auth.createSession({
      accountId: "planner",
      nowIso: "2026-06-12T00:00:00.000Z",
    });

    expect(() =>
      auth.createSession({
        accountId: "intruder",
        nowIso: "2026-06-12T00:00:00.000Z",
      }),
    ).toThrow(/unique session token/i);
    expect(
      auth.resolveSession(first.token, "2026-06-12T01:00:00.000Z")?.account.id,
    ).toBe("planner");
  });

  it("hands login to the configured credential verifier", async () => {
    const attempts: string[] = [];
    const backend = createCrowdSimBackend({
      verifyLogin: ({ accountId, body }) => {
        attempts.push(accountId);

        return body.credential === `${accountId}-secret`;
      },
    });

    const rejected = await requestJson<ErrorPayload>(backend.fetch, "/api/auth/login", {
      body: { accountId: "planner", credential: "guess" },
      method: "POST",
    });
    const accepted = await requestJson<AuthSessionPayload>(
      backend.fetch,
      "/api/auth/login",
      {
        body: { accountId: "planner", credential: "planner-secret" },
        method: "POST",
      },
    );
    const projects = await requestJson<ProjectsPayload>(
      backend.fetch,
      "/api/projects",
      {
        token: accepted.body.session.token,
      },
    );

    expect(rejected.status).toBe(401);
    expect(rejected.body.error).toBe("login-rejected");
    expect(accepted.status).toBe(201);
    expect(projects.status).toBe(200);
    expect(attempts).toEqual(["planner", "planner"]);
  });
});
