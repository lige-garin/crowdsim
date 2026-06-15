export type AccountRecord = {
  displayName: string;
  id: string;
};

export type AuthSessionRecord = {
  account: AccountRecord;
  createdAtIso: string;
  expiresAtIso: string;
  token: string;
};

export type LoginInput = {
  accountId: string;
  displayName?: string;
  nowIso: string;
};

const defaultSessionDurationMs = 8 * 60 * 60 * 1000;

export class AuthSessionStore {
  private readonly sessions = new Map<string, AuthSessionRecord>();

  createSession(input: LoginInput) {
    const createdAt = new Date(input.nowIso);

    if (Number.isNaN(createdAt.valueOf())) {
      throw new Error("Login timestamp must be a valid ISO date");
    }

    const account: AccountRecord = {
      displayName: input.displayName ?? input.accountId,
      id: input.accountId,
    };
    const session: AuthSessionRecord = {
      account,
      createdAtIso: input.nowIso,
      expiresAtIso: new Date(
        createdAt.valueOf() + defaultSessionDurationMs,
      ).toISOString(),
      token: createToken(input.accountId, input.nowIso),
    };

    this.sessions.set(session.token, session);
    return cloneSession(session);
  }

  resolveSession(token: string, nowIso: string) {
    const session = this.sessions.get(token);

    if (!session || session.expiresAtIso <= nowIso) {
      return null;
    }

    return cloneSession(session);
  }

  revokeSession(token: string) {
    return this.sessions.delete(token);
  }
}

function cloneSession(session: AuthSessionRecord): AuthSessionRecord {
  return {
    ...session,
    account: { ...session.account },
  };
}

function createToken(accountId: string, timestampIso: string) {
  return `csess_${fnv1a32(`${accountId}|${timestampIso}`)}`;
}

function fnv1a32(input: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
