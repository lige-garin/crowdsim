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

export type RandomBytesSource = (byteLength: number) => Uint8Array;

export type AuthSessionStoreOptions = {
  randomBytes?: RandomBytesSource;
};

const defaultSessionDurationMs = 8 * 60 * 60 * 1000;
const sessionTokenBytes = 32;

export class AuthSessionStore {
  private readonly randomBytes: RandomBytesSource;
  private readonly sessions = new Map<string, AuthSessionRecord>();

  constructor(options: AuthSessionStoreOptions = {}) {
    this.randomBytes = options.randomBytes ?? webCryptoRandomBytes;
  }

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
      token: this.createToken(),
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

  /**
   * Derived from a CSPRNG only. Deriving it from the account id and a
   * timestamp made every live token reconstructable by anyone who knew who
   * logged in and roughly when.
   */
  private createToken() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const bytes = this.randomBytes(sessionTokenBytes);

      if (bytes.length !== sessionTokenBytes) {
        throw new Error(`Session token source must return ${sessionTokenBytes} bytes`);
      }

      const token = `csess_${toHex(bytes)}`;

      if (!this.sessions.has(token)) {
        return token;
      }
    }

    throw new Error("Unable to generate a unique session token");
  }
}

function cloneSession(session: AuthSessionRecord): AuthSessionRecord {
  return {
    ...session,
    account: { ...session.account },
  };
}

function webCryptoRandomBytes(byteLength: number) {
  const bytes = new Uint8Array(byteLength);

  globalThis.crypto.getRandomValues(bytes);

  return bytes;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
