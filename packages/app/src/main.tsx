import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
/* One sheet per UI region, imported in cascade order. They replaced 19
 * historically-layered stylesheets that re-declared the same selectors to
 * out-order each other (`.workspace` alone was defined 14 times) and settled
 * ties with 392 `!important` declarations. Every selector is now defined once;
 * if a rule is not doing what you expect, it is the only rule involved. */
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/network.css";
import "./styles/shell.css";
import "./styles/stage.css";
import "./styles/editor.css";
import "./styles/inspector.css";
import "./styles/panels.css";
/* Last: the game HUD overrides the docked-shell layout the region sheets
 * describe. Those sheets still style the panels themselves, which the HUD
 * reuses inside floating windows. */
import "./styles/hud.css";
import { App } from "./App";
import { AppErrorBoundary } from "./ErrorBoundary";
import { installGlobalErrorDiagnostics } from "./errorDiagnostics";

// Before anything can throw: the diagnostics ring buffer wants the whole
// session's trail, not just what survived after mount.
installGlobalErrorDiagnostics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
