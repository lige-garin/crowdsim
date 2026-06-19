import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./appHome.css";
import "./contactNetwork.css";
import "./sceneEditor.css";
import "./panels.css";
import "./panelDock.css";
import "./responsive.css";
import "./commercial.css";
import "./commercialPanels.css";
import "./commercialResponsive.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
