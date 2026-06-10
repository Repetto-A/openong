import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSession, saveSession } from '@/lib/onboarding/store';
import { runAgentTurn } from '@/lib/onboarding/agent';
import type {
  ChatAttachment,
  OnboardingMessage
} from '@/lib/onboarding/types';

export async function POST(request: Request) {
  const { userId, orgSlug } = await auth();
  if (!userId || !orgSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    sessionId?: string;
    message?: string;
    attachments?: ChatAttachment[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, message = '', attachments = [] } = body;
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  if (!message.trim() && attachments.length === 0) {
    return NextResponse.json(
      { error: 'Message or attachments required' },
      { status: 400 }
    );
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (session.subdomain && session.subdomain !== orgSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (session.status === 'completed') {
    return NextResponse.json(
      { error: 'Onboarding already completed' },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const userMessage: OnboardingMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: message,
    attachments: attachments.length ? attachments : undefined,
    createdAt: now
  };
  session.messages.push(userMessage);

  const result = await runAgentTurn(session, message, attachments);

  const assistantMessage: OnboardingMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: result.assistantMessage,
    questionKey: result.nextQuestionKey,
    createdAt: new Date().toISOString()
  };
  session.messages.push(assistantMessage);
  session.currentQuestionKey = result.nextQuestionKey;

  await saveSession(session);

  return NextResponse.json({
    session,
    assistantMessage,
    shouldComplete: result.shouldComplete
  });
}
