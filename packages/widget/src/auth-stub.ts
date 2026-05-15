/**
 * Default AuthAdapter for playground + tests.
 *
 * Returns a fixed demo user. Real consumers (Pivotal, Lion's Share) inject
 * their own AuthAdapter wired to session state + role taxonomy.
 */

import type { AuthAdapter } from './adapters'
import type { AuthorRef } from './types'

const DEMO_USER: AuthorRef = { id: 'demo', display: 'You' }

export const defaultAuth: AuthAdapter = {
  async getCurrentUser() {
    return DEMO_USER
  },
}
