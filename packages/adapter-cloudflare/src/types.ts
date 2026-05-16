/**
 * Minimal D1Database interface. We don't depend on @cloudflare/workers-types
 * directly here so consumers can swap in any wrapper that matches this
 * shape (better-sqlite3 + a thin wrapper, durable-objects-sqlite, the
 * miniflare test harness, etc.). The shape is the subset of D1 that
 * CloudflareAdapter actually calls.
 */
export type D1Like = {
  prepare(query: string): D1PreparedStatementLike
}

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results?: T[] }>
  run(): Promise<{ success?: boolean; meta?: { changes?: number } }>
}

export type CloudflareAdapterOptions = {
  /** D1 binding from the consumer's worker env. */
  db: D1Like
  /** Identity for stamping created/modified rows. */
  currentUser: { id: string; display: string; avatarUrl?: string }
  /** Optional: override Date.now for deterministic tests. */
  now?: () => number
  /** Optional: write to annotation_audit_log on every mutation. */
  audit?: boolean
}
