import 'server-only';

type AuthDebugPayload = {
  pathname: string;
  host?: string | null;
  userId?: string | null;
  orgSlug?: string | null;
  reason?: string;
};

export function logDevAuthDebug(payload: AuthDebugPayload): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (process.env.DEV_AUTH_DEBUG !== 'true') return;

  console.info('[auth-debug]', {
    pathname: payload.pathname,
    host: payload.host ?? null,
    nodeEnv: process.env.NODE_ENV,
    userId: payload.userId ?? null,
    orgSlug: payload.orgSlug ?? null,
    reason: payload.reason ?? null
  });
}
