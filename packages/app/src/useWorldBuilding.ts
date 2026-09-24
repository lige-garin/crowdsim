import type { CrowdSimScene, ScenePoint } from "@crowdsim/scene-schema";
import { useEffect, useRef, useState } from "react";
import type { EditorTool } from "./sceneEditorState";
import { placeInScene } from "./renderer/worldPlacement";

/**
 * Building straight into the 3D world: each click commits one placement to the
 * live scene, and undo walks back through them.
 *
 * A placement is swapped into the running simulation (ADR-0007), so the crowd
 * keeps going, exactly like "apply" in the 2D editor. History only
 * covers consecutive world placements: once the scene changes by any other
 * route (the editor, an import), stepping back would silently discard that
 * change, so the history is dropped instead.
 */
export function useWorldBuilding(options: {
  applyScene: (scene: CrowdSimScene) => void;
  enabled: boolean;
  onCancelTool: () => void;
  scene: CrowdSimScene;
}) {
  const { applyScene, enabled, onCancelTool, scene } = options;
  // The stack is only valid while the live scene is the one it produced.
  const [history, setHistory] = useState<{
    after: CrowdSimScene | null;
    before: readonly CrowdSimScene[];
  }>({ after: null, before: [] });
  // Only where the building happened. On the editor tab, undoing a 3D
  // placement changed the live scene under the editor's open document, and
  // "apply" then silently put the building back.
  const canUndo = enabled && history.before.length > 0 && history.after === scene;

  function place(tool: EditorTool, point: ScenePoint) {
    const next = placeInScene(scene, tool, point);
    if (!next) return;
    const before = history.after === scene ? history.before : [];
    setHistory({ after: next, before: [...before, scene] });
    applyScene(next);
  }

  function undo() {
    if (!canUndo) return;
    const previous = history.before.at(-1)!;
    setHistory({ after: previous, before: history.before.slice(0, -1) });
    applyScene(previous);
  }

  const undoRef = useRef(undo);
  const cancelRef = useRef(onCancelTool);
  useEffect(() => {
    undoRef.current = undo;
    cancelRef.current = onCancelTool;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable]")
      ) {
        return;
      }
      if (event.key === "Escape") cancelRef.current();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  return { canUndo, place, undo };
}
