import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./stylesRenderOverlay.css";
import "./appHome.css";
import "./contactNetwork.css";
import "./sceneEditor.css";
import "./sceneEditorParams.css";
import "./panels.css";
import "./panelDock.css";
import "./responsive.css";
import "./commercial.css";
import "./commercialShell.css";
import "./commercialStage.css";
import "./commercialGame.css";
import "./commercialOverlay.css";
import "./commercialPanels.css";
import "./commercialResponsive.css";
import "./commercialLightProduct.css";
import "./commercialLightViewport.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
