import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { HudIcon } from "./hudIcons";

type AppFloatingWindowProps = {
  children: ReactNode;
  /** Raised above other windows; set by the shell for the last one touched. */
  focused: boolean;
  onFocus: () => void;
  initialX: number;
  initialY: number;
  onClose: () => void;
  testId: string;
  title: string;
  width: number;
};

/**
 * A draggable, closable panel that floats over the scene.
 *
 * Docked rails put every readout permanently on screen and fought the scene for
 * space; a floating window is opened by choice, moved out of the way, and shut.
 * Dragging is pointer-capture on the title bar so it keeps tracking outside the
 * window and over the WebGPU canvas, which swallows plain mousemove.
 */
export function AppFloatingWindow({
  children,
  focused,
  onFocus,
  initialX,
  initialY,
  onClose,
  testId,
  title,
  width,
}: AppFloatingWindowProps) {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const dragOffset = useRef<{ x: number; y: number } | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    // Let the close button be a button.
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    dragOffset.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const offset = dragOffset.current;
    if (!offset) {
      return;
    }
    // Keep the title bar reachable: never let the window leave the viewport.
    const maxX = window.innerWidth - 120;
    const maxY = window.innerHeight - 56;
    setPosition({
      x: Math.min(maxX, Math.max(-width + 120, event.clientX - offset.x)),
      y: Math.min(maxY, Math.max(0, event.clientY - offset.y)),
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    dragOffset.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section
      className="hud-window"
      data-testid={testId}
      aria-label={title}
      onPointerDownCapture={onFocus}
      style={{
        left: position.x,
        top: position.y,
        width,
        // Never taller than the room below its own top edge, so its bottom (and
        // its scrollbar's end) stays on screen wherever it is opened or dragged.
        maxHeight: `min(72dvh, 720px, calc(100dvh - ${Math.round(position.y) + 14}px))`,
        zIndex: focused ? 41 : undefined,
      }}
    >
      <header
        className="hud-window-bar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <strong>{title}</strong>
        <button type="button" aria-label={`${title} ×`} onClick={onClose}>
          <HudIcon name="close" size={14} />
        </button>
      </header>
      <div className="hud-window-body">{children}</div>
    </section>
  );
}
