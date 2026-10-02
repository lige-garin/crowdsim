/**
 * The local diagnostics channel (REVIEW-2026-10-02 P1 #8, local half):
 * a fixed-size ring buffer of recent errors, persisted best-effort so a
 * crash plus reload keeps the trail, and a formatter that turns it into a
 * pasteable bug report. No network, no telemetry — the user decides where
 * the text goes. Capture points are the ones that exist without monkey
 * patching: `window.onerror`-style events, `unhandledrejection`, and the
 * error boundary's own `componentDidCatch`.
 */

export type DiagnosticEntry = {
  at: number;
  kind: "error" | "rejection" | "ui";
  message: string;
};

const maxEntries = 50;
const maxMessageLength = 500;
const storageKey = "crowdsim.diagnostics.v1";

let entries = loadEntries();
let installed = false;

export function recordDiagnostic(kind: DiagnosticEntry["kind"], message: string) {
  entries.push({
    at: Date.now(),
    kind,
    message: message.slice(0, maxMessageLength),
  });
  if (entries.length > maxEntries) {
    entries = entries.slice(-maxEntries);
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    // Best-effort persistence: quota or disabled storage must never turn a
    // diagnostics record into a new error.
  }
}

export function formatDiagnostics(): string {
  const lines = entries.map(
    (entry) => `${new Date(entry.at).toISOString()} [${entry.kind}] ${entry.message}`,
  );

  return [
    `CrowdSim diagnostics — ${new Date().toISOString()}`,
    `url: ${typeof location === "undefined" ? "unknown" : location.href}`,
    `userAgent: ${typeof navigator === "undefined" ? "unknown" : navigator.userAgent}`,
    `crossOriginIsolated: ${String(globalThis.crossOriginIsolated)}`,
    entries.length === 0 ? "no recorded errors" : `last ${entries.length}:`,
    ...lines,
  ].join("\n");
}

/** Test seam: the ring is module-level state that must reset between cases. */
export function clearDiagnostics() {
  entries = [];
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // See recordDiagnostic: storage failures are never worth a new error.
  }
}

/** Installs the global capture points. Idempotent; call once at startup. */
export function installGlobalErrorDiagnostics() {
  if (typeof window === "undefined" || installed) {
    return;
  }
  installed = true;
  window.addEventListener("error", (event) => {
    recordDiagnostic("error", event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordDiagnostic("rejection", String(event.reason));
  });
}

function loadEntries(): DiagnosticEntry[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return [];
    }
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is DiagnosticEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as DiagnosticEntry).at === "number" &&
        typeof (entry as DiagnosticEntry).kind === "string" &&
        typeof (entry as DiagnosticEntry).message === "string",
    );
  } catch {
    // Corrupt or unwritable slot: start empty rather than throwing.
    return [];
  }
}
