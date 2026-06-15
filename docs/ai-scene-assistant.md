# AI Scene Assistant

T4.3 defines a browser-safe integration point for generating `.csim.json` scenes
from natural language. The app does not ship an API key or call Claude directly in
the browser. Instead, `packages/app/src/aiSceneAssistant.ts` exposes the request
body, JSON schema, response parser, and a local deterministic draft for demos.

## Claude request shape

Use the Messages API with structured outputs:

- `model`: defaults to `claude-sonnet-4-6`
- `messages`: one user prompt describing the venue, circulation, commercial
  objects, service points, and count lines
- `output_config.format.type`: `json_schema`
- `output_config.format.schema`: CrowdSim scene JSON schema subset

Claude structured outputs return valid JSON matching the schema in
`response.content[0].text`. The app then validates that text with
`parseSceneAssistantResponse`, which delegates to the shared scene schema before
anything reaches the editor.

References:

- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://platform.claude.com/docs/en/about-claude/models/overview

## Local fallback

`createLocalSceneAssistantDraft(prompt, baseScene)` is the current UI path. It
keeps all base geometry, then adds:

- two shops with attraction, capacity, and dwell-time parameters
- one gate service point
- one count line across the main circulation path

This keeps T4.3 verifiable without a backend while leaving the production Claude
adapter as a narrow server-side call:

1. Build the request with `createClaudeSceneAssistantRequest`.
2. Send it from a trusted server environment with the Anthropic API key.
3. Pass `response.content[0].text` through `parseSceneAssistantResponse`.
4. Import the validated scene into `SceneEditor`.
