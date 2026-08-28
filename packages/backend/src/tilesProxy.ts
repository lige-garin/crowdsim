import { containsSecretSearchParam, jsonResponse } from "./backendRequestUtils";

export type TilesProxyOptions = {
  fetch?: (request: Request) => Promise<Response>;
  googleApiKey?: string;
  upstreamBaseUrl?: string;
};

/**
 * Split from the proxy call so the route can settle every refusal before it
 * charges the caller's tile quota.
 */
export function checkTilesProxyRequest(url: URL, options: TilesProxyOptions) {
  if (containsSecretSearchParam(url)) {
    return jsonResponse(
      {
        error: "client-secret-blocked",
        message: "Tiles proxy URL must not include client-side keys or tokens.",
      },
      400,
    );
  }

  if (!options.googleApiKey) {
    return jsonResponse(
      {
        error: "tiles-secret-missing",
        message: "Server-side Google tiles key is not configured.",
      },
      503,
    );
  }

  return null;
}

export async function proxyGoogleTilesRequest(
  request: Request,
  url: URL,
  segments: readonly string[],
  options: TilesProxyOptions,
) {
  const upstreamUrl = createGoogleTilesUpstreamUrl(url, segments, options);
  const fetchTiles = options.fetch ?? fetch;
  const upstreamResponse = await fetchTiles(
    new Request(upstreamUrl, {
      headers: {
        accept: request.headers.get("accept") ?? "*/*",
        "x-crowdsim-tiles-proxy": "google-photorealistic-3d-tiles",
      },
      method: "GET",
    }),
  );

  return new Response(upstreamResponse.body, {
    headers: upstreamResponse.headers,
    status: upstreamResponse.status,
  });
}

function createGoogleTilesUpstreamUrl(
  url: URL,
  segments: readonly string[],
  options: TilesProxyOptions,
) {
  const upstreamBaseUrl =
    options.upstreamBaseUrl ?? "https://tile.googleapis.com/v1/3dtiles";
  const upstream = new URL(upstreamBaseUrl);
  const basePath = upstream.pathname.replace(/\/+$/, "");
  const tilePath = segments.slice(3).join("/") || "tileset.json";

  if (tilePath.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("Tiles path must not contain traversal segments");
  }

  upstream.pathname = `${basePath}/${tilePath}`;
  url.searchParams.forEach((value, key) => {
    upstream.searchParams.append(key, value);
  });
  upstream.searchParams.set("key", options.googleApiKey ?? "");

  return upstream;
}
