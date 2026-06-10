import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrgBySlug } from '@/lib/orgs';
import { getOrgRecommendations } from '@/lib/onboarding/org-store';
import { getSession } from '@/lib/onboarding/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { userId, orgSlug } = await auth();
  if (!userId || !orgSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId } = await params;
  const session = await getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.subdomain && session.subdomain !== orgSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const org = await getOrgBySlug(orgSlug);
  const recommendations =
    session.status === 'completed' && org
      ? await getOrgRecommendations(org.id)
      : [];

  return NextResponse.json({ session, recommendations });
}
