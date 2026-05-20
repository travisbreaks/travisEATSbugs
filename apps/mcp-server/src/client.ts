/**
 * Thin HTTP client to the canonical travisEATSbugs worker.
 *
 * Reads two env vars at construction:
 *   - `TEB_API_URL` (default `https://eats.travisfixes.com`)
 *   - `TEB_API_TOKEN` (REQUIRED; a member token from the worker's
 *     `MEMBER_TOKENS` env var, or a share-link HMAC token)
 *
 * Wraps the `@travisbreaks/travisEATSbugs-http` adapter so the MCP
 * tool handlers can call canonical CRUD methods without duplicating
 * the REST contract.
 */

import { HttpAdapter } from '@travisbreaks/travisEATSbugs-http'

export interface TebClientConfig {
  /** Worker base URL. Defaults to `https://eats.travisfixes.com`. */
  apiUrl?: string
  /** Member token or share-link token for `Authorization: Bearer`. Required. */
  apiToken: string
}

export function buildClient(config: TebClientConfig): HttpAdapter {
  const apiUrl = config.apiUrl ?? 'https://eats.travisfixes.com'
  return new HttpAdapter({
    baseUrl: apiUrl,
    authHeader: `Bearer ${config.apiToken}`,
  })
}

export function loadConfigFromEnv(): TebClientConfig {
  const apiToken = process.env.TEB_API_TOKEN
  if (!apiToken) {
    throw new Error(
      'TEB_API_TOKEN env var is required. Set it to a member token from your worker config.',
    )
  }
  const apiUrl = process.env.TEB_API_URL
  return {
    apiToken,
    ...(apiUrl ? { apiUrl } : {}),
  }
}
