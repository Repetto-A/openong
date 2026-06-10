/**
 * Server-side implementations of the tools the ElevenLabs voice agent can call.
 *
 * These mirror the tool schemas documented in
 * docs/ELEVENLABS_ONBOARDING_AGENT.md. Each function loads the session,
 * mutates it, persists it, and returns a compact result the agent can speak
 * back from.
 *
 * All callers MUST verify the bearer token first (lib/onboarding/auth.ts).
 */

import { finalizeOnboardingSession } from './finalize';
import { getSession, saveSession } from './store';
import {
  canComplete,
  mergeProfile,
  recordAnswer,
  refreshDerivedMetadata
} from './profile';
import { normalizeConfidence } from './agent';
import { QUESTION_BY_KEY } from './questions';
import { markOrgOnboarded } from '@/lib/orgs';
import type {
  DeepPartial,
  NgoOnboardingProfile,
  OnboardingSession
} from './types';

export type ToolError = { ok: false; error: string; status: 404 | 400 | 422 };
export type ToolOk<T> = { ok: true; data: T };
export type ToolResult<T> = ToolOk<T> | ToolError;

/** Flags the session as voice/mixed-sourced once a voice tool writes to it. */
function markVoiceSource(session: OnboardingSession): void {
  if (session.source === 'voice_agent') return;
  session.source =
    session.messages.length > 0 || Object.keys(session.answers).length > 0
      ? 'mixed'
      : 'voice_agent';
  session.profile.metadata.source = session.source;
}

function stateSnapshot(session: OnboardingSession) {
  return {
    sessionId: session.id,
    status: session.status,
    currentQuestionKey: session.currentQuestionKey,
    completedBlocks: session.completedBlocks,
    missingFields: session.profile.metadata.missingFields,
    confidence: session.profile.metadata.confidence,
    profile: session.profile
  };
}

export async function getOnboardingState(
  sessionId: string
): Promise<ToolResult<ReturnType<typeof stateSnapshot>>> {
  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: 'Session not found', status: 404 };
  return { ok: true, data: stateSnapshot(session) };
}

export async function saveOnboardingAnswer(params: {
  sessionId: string;
  questionKey: string;
  answer: string;
  confidence?: string;
}): Promise<ToolResult<ReturnType<typeof stateSnapshot>>> {
  const { sessionId, questionKey, answer } = params;
  if (!questionKey || !answer) {
    return { ok: false, error: 'questionKey and answer are required', status: 400 };
  }
  if (!QUESTION_BY_KEY[questionKey]) {
    return {
      ok: false,
      error: `Unknown questionKey: ${questionKey}`,
      status: 400
    };
  }

  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: 'Session not found', status: 404 };

  recordAnswer(session, questionKey, answer, normalizeConfidence(params.confidence));
  markVoiceSource(session);
  await saveSession(session);

  return { ok: true, data: stateSnapshot(session) };
}

export async function updateOnboardingProfile(params: {
  sessionId: string;
  patch: DeepPartial<NgoOnboardingProfile>;
}): Promise<ToolResult<ReturnType<typeof stateSnapshot>>> {
  const { sessionId, patch } = params;
  if (!patch || typeof patch !== 'object') {
    return { ok: false, error: 'patch object is required', status: 400 };
  }

  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: 'Session not found', status: 404 };

  session.profile = mergeProfile(session.profile, patch);
  refreshDerivedMetadata(session);
  markVoiceSource(session);
  await saveSession(session);

  return { ok: true, data: stateSnapshot(session) };
}

export async function markOnboardingComplete(params: {
  sessionId: string;
  force?: boolean;
}): Promise<ToolResult<ReturnType<typeof stateSnapshot>>> {
  const session = await getSession(params.sessionId);
  if (!session) return { ok: false, error: 'Session not found', status: 404 };

  const answeredKeys = new Set(Object.keys(session.answers));
  if (!params.force && !canComplete(answeredKeys)) {
    return {
      ok: false,
      error: 'Minimum blocks not covered (identity, impact, fundraising, channels)',
      status: 422
    };
  }

  markVoiceSource(session);
  await finalizeOnboardingSession(session);

  if (session.subdomain) {
    await markOrgOnboarded(session.subdomain);
  }

  return { ok: true, data: stateSnapshot(session) };
}
