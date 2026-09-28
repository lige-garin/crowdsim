import { useEffect, useRef } from "react";
import { Color, PerspectiveCamera, Scene, Vector3 } from "three";
import { defaultDemoScene } from "../scenes/defaultDemoScene";
import {
  CITY_CAMERA_FOV_DEGREES,
  orbitToPosition,
  type OrbitState,
} from "../viewport/orbitCamera";
import { createCityObjects } from "./cityMeshes";
import { createFallbackViewportRenderer } from "./simulationViewportRendererFactory";
import {
  cityNightLevel,
  createDayNightRig,
  disposeRenderObject,
} from "./simulationViewportSceneObjects";

/**
 * Purely decorative: a slowly-orbiting, static procedural city used as the
 * homepage backdrop. Reuses the same city builder (`cityMeshes.ts`), day-night
 * lighting rig, and orbit-camera math (`orbitCamera.ts`) the real simulation
 * viewport uses, but never runs a simulation step and never needs WebGPU — a
 * plain `WebGLRenderer` (`createFallbackViewportRenderer`) is simpler and more
 * universally supported for a background that will never do compute work.
 */

// An evening moment: windows and street lamps lit (see `cityNightLevel`),
// sky not yet fully dark -- 900 (sun level ~0.03, `cityNightLevel` 1.0) read
// as near-midnight, too dark to show the city's own shapes and colour;
// verified against the real renderer, not just the light-curve maths.
const ELAPSED_SECONDS_FOR_LOOK = 750;
// A full turn in about 12 minutes — slow enough to read as "still", not "spinning".
const ORBIT_RADIANS_PER_SECOND = (2 * Math.PI) / (12 * 60);

export function CityHeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Feature-detect WebGL *before* constructing a three.js `WebGLRenderer`:
    // its constructor throws when it cannot get a context, which jsdom (no
    // `canvas` package installed) never can -- the same crash EChart.tsx
    // guards against for canvas 2D. A test environment, or a real browser
    // with WebGL disabled, just gets the homepage without the backdrop.
    //
    // Probed on a scratch canvas, not the real one, for the same reason
    // EChart.tsx's own probe does: once a context is bound to a canvas,
    // later `getContext(sameType, newAttributes)` calls return that same
    // context and silently ignore the new attributes -- probing the real
    // canvas here would have bound it with the browser's default context
    // attributes before `createFallbackViewportRenderer` ever got to ask
    // for its own (antialias, no stencil, high-performance).
    if (
      !document.createElement("canvas").getContext("webgl2") &&
      !document.createElement("canvas").getContext("webgl")
    ) {
      return;
    }

    const scene = new Scene();
    scene.background = new Color("#050b18");
    const camera = new PerspectiveCamera(CITY_CAMERA_FOV_DEGREES, 1, 0.5, 2600);
    const renderer = createFallbackViewportRenderer(canvas);

    const city = createCityObjects(defaultDemoScene);
    city.objects.forEach((object) => scene.add(object));
    city.setNightLevel(cityNightLevel(ELAPSED_SECONDS_FOR_LOOK));

    const lightRig = createDayNightRig(defaultDemoScene.world);
    lightRig.attach(scene);
    lightRig.setTime(ELAPSED_SECONDS_FOR_LOOK);

    const orbit: OrbitState = { azimuth: 0, polar: (58 * Math.PI) / 180, radius: 210 };
    const target = new Vector3(0, 0, 6);

    let animationFrameId = 0;
    let lastTime = performance.now();

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      const safeWidth = Math.max(1, Math.floor(width));
      const safeHeight = Math.max(1, Math.floor(height));
      camera.aspect = safeWidth / safeHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(safeWidth, safeHeight, false);
    }

    // No `disposed` guard needed: this loop is fully synchronous (no awaited
    // gaps a stale callback could fire into, unlike useSimulationViewportRenderer.ts's
    // loop, which really does have async GPU-adapter gaps) -- cancelling the
    // queued frame in cleanup is already enough to stop it for good.
    function animate(time: number) {
      const deltaSeconds = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;
      orbit.azimuth += deltaSeconds * ORBIT_RADIANS_PER_SECOND;
      const position = orbitToPosition(orbit, {
        x: target.x,
        y: target.y,
        z: target.z,
      });
      camera.position.set(position.x, position.y, position.z);
      camera.lookAt(target);
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement ?? canvas);
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      lightRig.dispose();
      renderer.dispose();
      city.objects.forEach((object) => disposeRenderObject(object));
    };
  }, []);

  return <canvas ref={canvasRef} className="home-city-canvas" aria-hidden="true" />;
}
