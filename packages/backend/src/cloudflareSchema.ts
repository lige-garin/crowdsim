export const cloudflareD1SchemaSql = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    scene_json TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_at_iso TEXT NOT NULL,
    updated_at_iso TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS project_versions (
    project_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    scene_json TEXT NOT NULL,
    created_at_iso TEXT NOT NULL,
    PRIMARY KEY (project_id, version)
  );`,
  `CREATE TABLE IF NOT EXISTS share_links (
    token TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at_iso TEXT NOT NULL,
    expires_at_iso TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS usage_counters (
    owner_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    amount INTEGER NOT NULL,
    PRIMARY KEY (owner_id, metric)
  );`,
  `CREATE TABLE IF NOT EXISTS project_artifacts (
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    content_type TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    created_at_iso TEXT NOT NULL,
    PRIMARY KEY (project_id, kind, artifact_id)
  );`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    project_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    at_iso TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS collaboration_events (
    project_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    at_iso TEXT NOT NULL
  );`,
].join("\n\n");
