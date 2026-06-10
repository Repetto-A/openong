import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSession } from '@/lib/onboarding/profile';
import { saveSession } from '@/lib/onboarding/store';
import { openingTurn } from '@/lib/onboarding/agent';
import type { OnboardingMessage, OnboardingSource } from '@/lib/onboarding/types';
import { sanitizeSubdomain } from '@/lib/subdomains';

export async function POST(request: Request) {
  const { userId, orgSlug } = await auth();
  if (!userId || !orgSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { subdomain?: string; source?: OnboardingSource } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const requestedSubdomain = body.subdomain
    ? sanitizeSubdomain(body.subdomain)
    : undefined;

  if (requestedSubdomain && requestedSubdomain !== orgSlug) {
    return NextResponse.json({ error: 'Subdomain mismatch' }, { status: 409 });
  }

  const session = createSession({
    id: crypto.randomUUID(),
    subdomain: orgSlug,
    source: body.source ?? 'text_chat'
  });

  const opening = openingTurn();
  const assistantMessage: OnboardingMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: opening.message,
    questionKey: opening.questionKey,
    createdAt: new Date().toISOString()
  };
  session.messages.push(assistantMessage);
  session.currentQuestionKey = opening.questionKey;

  await saveSession(session);

  return NextResponse.json({ session }, { status: 201 });
}
