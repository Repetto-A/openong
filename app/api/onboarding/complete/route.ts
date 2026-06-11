import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrgBySlug } from '@/lib/orgs';
import { finalizeOnboardingSession } from '@/lib/onboarding/finalize';
import { getSession } from '@/lib/onboarding/store';
import { computeMissingFields } from '@/lib/onboarding/profile';

export async function POST(request: Request) {
  const { userId, orgSlug } = await auth();
  if (!userId || !orgSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { sessionId?: string; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, force = false } = body;
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (session.subdomain && session.subdomain !== orgSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const missingFields = computeMissingFields(session.profile);
  if (!force && missingFields.length > 0) {
    return NextResponse.json(
      { error: 'Required fields missing', missingFields },
      { status: 422 }
    );
  }

  const org = await getOrgBySlug(orgSlug);
  const recommendations = await finalizeOnboardingSession(session, {
    orgId: org?.id,
    orgSlug
  });

  return NextResponse.json({ session, recommendations });
}
