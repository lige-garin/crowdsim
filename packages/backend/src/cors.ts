export type CorsOptions = {
  allowCredentials?: boolean;
  allowedHeaders?: readonly string[];
  allowedOrigins?: readonly string[];
  maxAgeSeconds?: number;
};

const defaultAllowedHeaders = ["authorization", "content-type"];
const defaultAllowedMethods = ["DELETE", "GET", "OPTIONS", "POST", "PUT"];
const defaultMaxAgeSeconds = 600;

/**
 * `*` plus credentials is rejected by browsers anyway, and a backend that
 * silently ships that combination looks configured while every cross-origin
 * authenticated call fails. Fail loudly at construction instead.
 */
export function assertCorsOptions(options: CorsOptions) {
  if (options.allowCredentials && options.allowedOrigins?.includes("*")) {
    throw new Error("CORS wildcard origin cannot be combined with credentials");
  }
}

export function isAllowedOrigin(origin: string, options: CorsOptions) {
  const allowedOrigins = options.allowedOrigins ?? [];

  return (
    allowedOrigins.includes(origin) ||
    (allowedOrigins.includes("*") && !options.allowCredentials)
  );
}

export function resolveCorsHeaders(
  request: Request,
  options: CorsOptions,
): Record<string, string> {
  const origin = request.headers.get("origin");

  if (!origin) {
    return {};
  }

  if (!isAllowedOrigin(origin, options)) {
    return { vary: "Origin" };
  }

  return {
    "access-control-allow-origin": origin,
    ...(options.allowCredentials ? { "access-control-allow-credentials": "true" } : {}),
    vary: "Origin",
  };
}

export function createPreflightResponse(request: Request, options: CorsOptions) {
  const origin = request.headers.get("origin");
  const corsHeaders = resolveCorsHeaders(request, options);

  if (origin && !corsHeaders["access-control-allow-origin"]) {
    return new Response(null, { headers: corsHeaders, status: 403 });
  }

  return new Response(null, {
    headers: {
      ...corsHeaders,
      "access-control-allow-headers": (
        options.allowedHeaders ?? defaultAllowedHeaders
      ).join(", "),
      "access-control-allow-methods": defaultAllowedMethods.join(", "),
      "access-control-max-age": String(options.maxAgeSeconds ?? defaultMaxAgeSeconds),
    },
    status: 204,
  });
}

export function withCorsHeaders(
  response: Response,
  corsHeaders: Record<string, string>,
) {
  const entries = Object.entries(corsHeaders);

  if (entries.length === 0) {
    return response;
  }

  const headers = new Headers(response.headers);

  for (const [key, value] of entries) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
