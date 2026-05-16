/**
 * Three adapter contracts that bridge the widget to a host app.
 *
 * The widget owns no I/O. Hosts plug in their own API, auth, and theme.
 *
 * See docs/architecture.md for the contract rationale and the auth-coupling
 * decision (the widget never assumes a session model; hosts inject one).
 */

import type {
  AnchorQuery,
  Annotation,
  AuthorRef,
  CreateInput,
  ListQuery,
  UpdatePatch,
} from './types'

export type ApiAdapter = {
  list(query: ListQuery): Promise<Annotation[]>
  create(input: CreateInput): Promise<Annotation>
  update(id: string, patch: UpdatePatch): Promise<Annotation>
  delete(id: string): Promise<void>
  listAuthors?(): Promise<AuthorRef[]>
}

export type AuthAdapter = {
  getCurrentUser(): Promise<AuthorRef | null>
  canAdmin?(user: AuthorRef): boolean
}

export type ThemeAdapter = {
  cssVars?: Record<string, string>
  buttonLabel?: string
  drawerTitle?: string
  emptyStateCopy?: string
  footerHint?: string
  prUrlTemplate?: (n: number) => string
  inferSeverity?: (a: Annotation) => 'low' | 'medium' | 'high'
}

// Re-export the query type so adapter implementers don't need a second import.
export type { AnchorQuery, ListQuery, UpdatePatch, CreateInput }
