/**
 * travisEATSbugs default backend worker entrypoint.
 *
 * Mounts at eats.travisfixes.com (once DNS is wired). Delegates all
 * routing to handlers.ts. Keeping this entry file thin so the request
 * lifecycle is easy to read at a glance.
 */

import { type WorkerEnv, handle } from './handlers'

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    return handle(req, env)
  },
}

export type { WorkerEnv } from './handlers'
