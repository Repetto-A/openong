# Environment variables

> The repo's `.gitignore` ignores `.env*`, so this file documents the variables
> instead of shipping a `.env.example`. Copy the block below into `.env.local`.

```env
# ─────────────────────────────────────────────────────────────
# Existing app (Vercel Platforms starter)
# ─────────────────────────────────────────────────────────────
# Upstash Redis — used by subdomains, pages AND onboarding sessions.
# If unset, the onboarding feature falls back to an in-memory store
# (per-process, non-durable) so local/demo still works.
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Root domain for multi-tenant subdomains (defaults to localhost:3000).
# For local cross-subdomain auth use lvh.me (resolves to 127.0.0.1 and shares
# cookies across *.lvh.me): NEXT_PUBLIC_ROOT_DOMAIN=lvh.me:3000
NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000

# ─────────────────────────────────────────────────────────────
# Clerk authentication (organizations only) — REQUIRED
# ─────────────────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Development-only auth diagnostics. Logs minimal auth state on server routes
# when enabled. It never bypasses Clerk and must not be enabled in production.
DEV_AUTH_DEBUG=false

# ─────────────────────────────────────────────────────────────
# Onboarding text agent (OPTIONAL)
# ─────────────────────────────────────────────────────────────
# If NEITHER key is set, the text agent runs in deterministic mode
# (scripted interview) — no external calls, always works.
# Anthropic is preferred when both are present.
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
# Override the model used by whichever provider is active.
# Defaults: claude-sonnet-4-6 (Anthropic) / gpt-4o-mini (OpenAI).
ONBOARDING_LLM_MODEL=

# ─────────────────────────────────────────────────────────────
# ElevenLabs voice onboarding agent (OPTIONAL)
# ─────────────────────────────────────────────────────────────
# Server-side ElevenLabs credentials (for signed URLs / future server calls).
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=

# Public agent id consumed by the in-browser ConvAI widget.
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=

# Bearer token the ElevenLabs agent must send to /api/onboarding/voice/*.
# If unset, the voice endpoints are DISABLED (fail closed, return 503).
# Generate a strong random value, e.g.: openssl rand -hex 32
ONBOARDING_AGENT_SERVICE_TOKEN=

# Toggle the "Hablar con el agente" voice block in the UI.
NEXT_PUBLIC_ONBOARDING_VOICE_ENABLED=false
```

## Behavior matrix

| Variable group        | Set                                  | Unset (fallback)                          |
| --------------------- | ------------------------------------ | ----------------------------------------- |
| `KV_REST_API_*`       | Durable Redis sessions               | In-memory store (demo only)               |
| `ANTHROPIC/OPENAI`    | LLM-driven conversational interview  | Deterministic scripted interview          |
| `ONBOARDING_AGENT_SERVICE_TOKEN` | Voice endpoints enabled   | Voice endpoints return 503 (fail closed)  |
| `NEXT_PUBLIC_ONBOARDING_VOICE_ENABLED` | Voice block shown  | Text-only onboarding (still complete)     |

Nothing in the above is required to run the onboarding by text locally.

## Local Clerk troubleshooting

Use `http://lvh.me:3000` for local auth testing when working with subdomains:

```env
NEXT_PUBLIC_ROOT_DOMAIN=lvh.me:3000
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

If the app loops between auth and `/create`, verify these before changing code:

1. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` come from the
   same Clerk instance and environment.
2. Your system clock is synchronized. Clerk JWTs can fail with
   `token-not-active-yet` / `nbf` errors when the local clock is behind.
3. Clear stale cookies for `localhost`, `lvh.me`, and the Clerk domain after
   changing keys or root domain settings.
4. Restart `pnpm dev` after changing `.env` values.

For temporary server-side diagnostics in development only, set:

```env
DEV_AUTH_DEBUG=true
```

This only logs `pathname`, `host`, `NODE_ENV`, `userId`, `orgSlug`, and a reason
label. It does not print secrets or tokens and does not bypass authentication.

## Clerk setup (dashboard)

Auth is **organizations only** (no personal accounts). Configure the Clerk
instance once:

1. **Organizations**: enable Organizations and disable personal accounts /
   personal workspaces so every user acts inside an org. Under *Organizations
   Settings*, also enable **organization slugs** — the slug IS the tenant
   subdomain, so `createOrganization({ slug })` fails with "organization slugs
   not enabled" until this is on.
2. **Sign-in methods**: enable **Google OAuth** and **Email verification code
   (OTP)**.
3. **Superadmins**: set `publicMetadata.role = "superadmin"` on the users that
   should reach `/superadmin` and browse every ONG. The role is read from the
   user's `publicMetadata` server-side, so no session-token customization is
   needed.
4. **Domains (production)**: add the root domain to the Clerk instance. The
   authenticated area lives on the root domain (`/admin`, `/onboarding`,
   `/pedidos`, `/campaigns/...`, `/superadmin`); tenant subdomains only serve
   public pages, so the session does not need to be shared across subdomains.

The onboarding-completed flag is stored per organization in Clerk
`publicMetadata.onboardingCompletedAt` — there are no webhooks and no org/user
duplication in Redis. Redis only holds operational data keyed by organization
id (`org:{orgId}:campaigns`, `org:{orgId}:orders`, `org:{orgId}:page:{slug}`,
`org:{orgId}:traffic:*`).

## Campaign Agent MVP

```env
# Postgres for operational Campaign Agent entities (drafts, beneficiaries,
# collaborators, contributions, reception points, messages and tool calls).
# DATABASE_URL is preferred; POSTGRES_URL is also accepted.
DATABASE_URL=
POSTGRES_URL=

# Optional bearer token for voice adapters calling /api/campaign-agent/tool.
# If unset, browser/Clerk usage still works; bearer voice calls fail closed.
CAMPAIGN_AGENT_SERVICE_TOKEN=
```

Boundary: Redis remains used for existing onboarding sessions/profile snapshots,
Puck page data, traffic and legacy campaign/order arrays. New operational
Campaign Agent data belongs in Postgres/Drizzle so the tablero can query by
status, assignment and ownership without rebuilding relational indexes in Redis.
