import { AsyncLocalStorage } from "node:async_hooks";

/** The selected member is request-scoped, never a replacement login. */
export interface CompanyAccessContext {
  actorId: string;
  actorName: string;
  targetId: string;
  targetName: string;
  /** Internal millisecond timestamp. */
  expiresAt: number;
}

interface RequestStore {
  context: CompanyAccessContext | null;
}

const companyAccessStore = new AsyncLocalStorage<RequestStore>();

/** Start an isolated mutable store for exactly one HTTP request. */
export function runCompanyAuditContext<T>(fn: () => T): T {
  return companyAccessStore.run({ context: null }, fn);
}

/** Mutate the request store; do not use enterWith across async request work. */
export function setCompanyAuditContext(context: CompanyAccessContext) {
  const store = companyAccessStore.getStore();
  if (!store) throw new Error("company_access_context_missing");
  store.context = context;
}

export function companyAuditContext(): CompanyAccessContext | null {
  return companyAccessStore.getStore()?.context ?? null;
}

/** Safe, non-secret banner metadata for the selected-member UI. */
export function companyAccessMetadata(context: CompanyAccessContext) {
  return {
    actorId: context.actorId,
    actorName: context.actorName,
    targetId: context.targetId,
    targetName: context.targetName,
    expiresAt: new Date(context.expiresAt).toISOString(),
  };
}
