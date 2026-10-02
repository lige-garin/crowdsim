import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
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
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
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
      </div>
    );
  }
}
