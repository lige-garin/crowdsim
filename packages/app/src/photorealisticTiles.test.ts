import { describe, expect, it } from "vitest";
import {
  assertTilesConfigHasNoClientSecret,
  createGeoAnchoredSceneId,
  createPhotorealisticTilesConfig,
  createTilesRendererIntegrationPlan,
  loadTilesRendererRuntime,
} from "./photorealisticTiles";

describe("photorealistic 3D tiles config", () => {
  it("creates client-safe proxy-backed tiles configuration", () => {
    const config = createPhotorealisticTilesConfig({
      anchor: {
        latitude: 31.2304,
        longitude: 121.4737,
      },
      proxyBaseUrl: "/api/tiles/google/",
    });

    expect(config).toMatchObject({
      attribution:
        "Visual basemap only; simulation collision geometry remains .csim.json.",
      enabled: true,
      provider: "google-photorealistic-3d-tiles",
      proxyUrl: "/api/tiles/google",
    });
    expect(() => assertTilesConfigHasNoClientSecret(config)).not.toThrow();
  });

  it("rejects absolute proxy URLs and detects secrets in client config", () => {
    expect(() =>
      createPhotorealisticTilesConfig({
        anchor: { latitude: 31, longitude: 121 },
        proxyBaseUrl: "https://example.com/tiles",
      }),
    ).toThrow("relative backend route");

    expect(() =>
      assertTilesConfigHasNoClientSecret({
        ...createPhotorealisticTilesConfig({
          anchor: { latitude: 31, longitude: 121 },
          proxyBaseUrl: "/api/tiles/google",
        }),
        proxyUrl: "/api/tiles/google?key=sk-secret_1234567890abcdef",
      }),
    ).toThrow("must not expose API keys");
  });

  it("creates stable geo-anchored scene identifiers", () => {
    expect(
      createGeoAnchoredSceneId("outdoor-evac", {
        latitude: 31.2304,
        longitude: 121.4737,
      }),
    ).toBe("outdoor-evac@31.23040,121.47370");
  });

  it("creates a Three WebGPU renderer integration plan", () => {
    const config = createPhotorealisticTilesConfig({
      anchor: {
        latitude: 31.2304,
        longitude: 121.4737,
      },
      proxyBaseUrl: "/api/tiles/google",
    });
    const plan = createTilesRendererIntegrationPlan(config);

    expect(plan).toEqual({
      cameraSync: ["setCamera", "setResolutionFromRenderer"],
      collisionGeometry: ".csim.json",
      dynamicImport: "import('3d-tiles-renderer')",
      moduleName: "3d-tiles-renderer",
      renderLoopHook: "tilesRenderer.update",
      renderer: "Three.WebGPURenderer",
      rootTilesetUrl: "/api/tiles/google/tileset.json",
      runtimeAdapter: "createTilesRendererRuntime",
      visualOnly: true,
    });
  });

  it("adapts a 3d-tiles-renderer runtime to Three WebGPU frames", async () => {
    FakeTilesRenderer.instances = [];
    const plan = createTilesRendererIntegrationPlan(
      createPhotorealisticTilesConfig({
        anchor: { latitude: 31.2304, longitude: 121.4737 },
        proxyBaseUrl: "/api/tiles/google",
      }),
    );
    const camera = { name: "camera" };
    const renderer = { name: "webgpu-renderer" };
    const runtime = await loadTilesRendererRuntime(plan, async () => ({
      TilesRenderer: FakeTilesRenderer,
    }));

    runtime.syncFrame({ camera, renderer });
    runtime.dispose();

    expect(runtime.rootTilesetUrl).toBe("/api/tiles/google/tileset.json");
    expect(runtime.collisionGeometry).toBe(".csim.json");
    expect(runtime.visualOnly).toBe(true);
    expect(FakeTilesRenderer.instances[0]).toMatchObject({
      disposed: true,
      rootTilesetUrl: "/api/tiles/google/tileset.json",
      updateCount: 1,
    });
    expect(FakeTilesRenderer.instances[0].camera).toBe(camera);
    expect(FakeTilesRenderer.instances[0].renderer).toBe(renderer);
  });
});

class FakeTilesRenderer {
  static instances: FakeTilesRenderer[] = [];
  camera: unknown;
  disposed = false;
  renderer: unknown;
  updateCount = 0;

  constructor(readonly rootTilesetUrl: string) {
    FakeTilesRenderer.instances.push(this);
  }

  dispose() {
    this.disposed = true;
  }

  setCamera(camera: unknown) {
    this.camera = camera;
  }

  setResolutionFromRenderer(_camera: unknown, renderer: unknown) {
    this.renderer = renderer;
  }

  update() {
    this.updateCount += 1;
  }
}
