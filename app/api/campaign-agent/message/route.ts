import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrgBySlug } from '@/lib/orgs';
import { runCampaignAgentTurn } from '@/lib/campaign-agent/agent';

export async function POST(request: Request) {
  const { userId, orgSlug } = await auth();
  if (!userId || !orgSlug) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const org = await getOrgBySlug(orgSlug);
  if (!org || !org.slug) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

  let body: { campaignDraftId?: string; message?: string; expectedVersion?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.campaignDraftId || !body.message?.trim()) {
    return NextResponse.json({ error: 'campaignDraftId and message are required' }, { status: 400 });
  }

  const result = await runCampaignAgentTurn(
    { orgId: org.id, orgSlug: org.slug, source: 'browser' },
    { campaignDraftId: body.campaignDraftId, message: body.message, expectedVersion: body.expectedVersion }
  );
  if (!result.ok) return NextResponse.json(result, { status: result.status ?? 400 });
  return NextResponse.json(result);
}
