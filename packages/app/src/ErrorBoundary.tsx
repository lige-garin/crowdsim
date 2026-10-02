import { Component, type ErrorInfo, type ReactNode } from "react";
import { formatDiagnostics, recordDiagnostic } from "./errorDiagnostics";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  copiedDiagnostics: boolean;
  error: Error | null;
};

/**
 * The last line of defence against a white screen. Every route into
 * "uncaught exception" territory — a localStorage quota error, a renderer
 * crash, a bad scene file — used to take the whole React tree down with no
 * explanation and no way back. This boundary keeps the failure readable and
 * offers the one recovery that always works: reload.
 *
 * Deliberately bilingual inline (not via i18n): it renders when the provider
 * below it may itself be part of the crash, so it must not depend on it.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { copiedDiagnostics: false, error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { copiedDiagnostics: false, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The local diagnostics channel (errorDiagnostics.ts): what the boundary
    // catches never reaches window.onerror, so record it here or the trail
    // misses every caught render error.
    recordDiagnostic("ui", `${String(error)} ${info.componentStack ?? ""}`);
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  async copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(formatDiagnostics());
      this.setState({ copiedDiagnostics: true });
    } catch {
      // Clipboard needs a secure context and permission; the details blocks
      // below still carry the information for a manual copy.
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div role="alert" className="app-error-boundary">
        <h1>界面出现错误 · The interface hit an error</h1>
        <p>
          页面未能从这次错误中恢复。你的最近修改可能没有保存。
          刷新页面即可重新开始；如果错误可以复现，请先导出场景文件再报告问题。
        </p>
        <p>
          The page could not recover from this error. Your latest edits may be unsaved.
          Reload to start again; if the error reproduces, export your scene file before
          reporting it.
        </p>
        <details>
          <summary>Error details</summary>
          <pre>{String(this.state.error)}</pre>
          {this.state.error.stack ? <pre>{this.state.error.stack}</pre> : null}
        </details>
        <button type="button" onClick={() => window.location.reload()}>
          刷新页面 · Reload
        </button>
        <button type="button" onClick={() => void this.copyDiagnostics()}>
          {this.state.copiedDiagnostics
            ? "已复制 · Copied"
            : "复制诊断信息 · Copy diagnostics"}
        </button>
      </div>
    );
  }
}
