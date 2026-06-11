import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrgBySlug } from '@/lib/orgs';
import { runCampaignAgentTool } from '@/lib/campaign-agent/tools';

function verifyBearer(request: Request) {
  const expected = process.env.CAMPAIGN_AGENT_SERVICE_TOKEN ?? process.env.ONBOARDING_AGENT_SERVICE_TOKEN;
  if (!expected) return { ok: false as const, status: 503, error: 'Campaign agent service token is not configured.' };
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || token.length !== expected.length) return { ok: false as const, status: 401, error: 'Invalid bearer token.' };
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0 ? { ok: true as const } : { ok: false as const, status: 401, error: 'Invalid bearer token.' };
}

async function resolveContext(request: Request, args: Record<string, unknown>) {
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Bearer ')) {
    const verified = verifyBearer(request);
    if (!verified.ok) return { ok: false as const, status: verified.status, error: verified.error };
    const orgId = typeof args.organizationId === 'string' ? args.organizationId : '';
    const orgSlug = typeof args.organizationSlug === 'string' ? args.organizationSlug : '';
    if (!orgId || !orgSlug) return { ok: false as const, status: 400, error: 'Voice tools require organizationId and organizationSlug.' };
    return { ok: true as const, ctx: { orgId, orgSlug, source: 'voice' as const } };
  }

  const { userId, orgSlug } = await auth();
  if (!userId || !orgSlug) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const org = await getOrgBySlug(orgSlug);
  if (!org || !org.slug) return { ok: false as const, status: 404, error: 'Organization not found' };
  return { ok: true as const, ctx: { orgId: org.id, orgSlug: org.slug, source: 'browser' as const } };
}

export async function POST(request: Request) {
  let body: { tool?: string; args?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.tool) return NextResponse.json({ error: 'Missing tool' }, { status: 400 });
  const args = body.args ?? {};
  const resolved = await resolveContext(request, args);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const result = await runCampaignAgentTool(resolved.ctx, { tool: body.tool, args });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  return NextResponse.json(result.data);
}
