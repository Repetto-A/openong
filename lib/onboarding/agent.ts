/**
 * Text onboarding agent.
 *
 * Two modes, transparent to callers:
 *
 *  1. LLM mode  — if ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY is set,
 *     the agent calls the provider with the system prompt + transcript and
 *     expects a JSON `AgentTurnResult`. Provider-agnostic via plain `fetch`,
 *     no SDK dependency.
 *
 *  2. Deterministic mode — no key required. A scripted engine walks the
 *     question list one at a time, maps each answer into the profile, and
 *     produces natural acknowledgements. Guarantees the demo always works.
 *
 * In both modes the deterministic profile patch is applied as a safety net so
 * the live summary is never empty even if the LLM omits structure.
 */

import {
  ONBOARDING_QUESTIONS,
  QUESTION_BY_KEY,
  getFirstQuestionKey,
  getNextQuestionKey
} from './questions';
import { buildTextAgentSystemPrompt } from './prompts';
import {
  computeMissingFields,
  mergeProfile,
  patchFromAnswer,
  recordAnswer,
  refreshDerivedMetadata
} from './profile';
import type {
  AgentTurnResult,
  ChatAttachment,
  Confidence,
  OnboardingSession
} from './types';

const SKIP_RE = /\b(no s[eé]|paso|salt(ar|emos)|skip|m[aá]s adelante|despu[eé]s|ni idea|no tengo)\b/i;

export function llmEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

/** Builds the assistant's opening message (first question). */
export function openingTurn(): { message: string; questionKey: string } {
  const key = getFirstQuestionKey();
  return {
    message:
      '¡Hola! Soy el asistente de onboarding. En unos minutos armamos juntos el perfil de tu organización para después generar tu kit de recaudación. ' +
      QUESTION_BY_KEY[key].prompt,
    questionKey: key
  };
}

/**
 * Runs one conversational turn.
 *
 * Mutates `session` (records the answer, merges the profile, advances the
 * current question) and returns the structured result for the response.
 */
export async function runAgentTurn(
  session: OnboardingSession,
  userMessage: string,
  attachments: ChatAttachment[] = []
): Promise<AgentTurnResult> {
  const answeredKey = session.currentQuestionKey;
  const attachmentContext = buildAttachmentContext(attachments);
  const combinedAnswer = [userMessage, attachmentContext]
    .filter(Boolean)
    .join('\n\n');

  // Record the answer to the question we just asked (unless it's a skip).
  const skipped = SKIP_RE.test(userMessage) && userMessage.trim().length < 40;
  if (answeredKey && combinedAnswer.trim() && !skipped) {
    recordAnswer(session, answeredKey, combinedAnswer, 'medium');
  } else if (answeredKey) {
    // Mark skipped so the engine moves on, with low confidence.
    session.answers[answeredKey] = {
      answer: skipped ? '(saltada)' : combinedAnswer,
      confidence: 'low',
      at: new Date().toISOString()
    };
    refreshDerivedMetadata(session);
  }

  if (llmEnabled()) {
    try {
      return await runLlmTurn(session, userMessage, attachmentContext);
    } catch (err) {
      console.warn(
        '[onboarding] LLM turn failed, falling back to deterministic engine:',
        err
      );
      // fall through to deterministic
    }
  }

  return runDeterministicTurn(session, skipped);
}

/* ------------------------------------------------------------------ */
/* Deterministic engine                                                */
/* ------------------------------------------------------------------ */

function runDeterministicTurn(
  session: OnboardingSession,
  skipped: boolean
): AgentTurnResult {
  const answeredKeys = new Set(Object.keys(session.answers));
  const nextKey = getNextQuestionKey(answeredKeys, session.currentQuestionKey);
  const requiredMissing = computeMissingFields(session.profile).length;
  const complete = !nextKey || requiredMissing === 0;

  // True only on the exact turn that fills the last required field — fires once.
  const justReachedMinimum =
    !skipped &&
    requiredMissing === 0 &&
    nextKey !== null &&
    Boolean(session.currentQuestionKey && QUESTION_BY_KEY[session.currentQuestionKey]?.required);

  let assistantMessage: string;

  if (!nextKey) {
    assistantMessage =
      'Perfecto. Ya tengo una primera versión del perfil de tu organización. ' +
      'Podés revisarlo en el panel de la derecha y, cuando quieras, finalizamos para generar tu kit de recaudación.';
  } else if (justReachedMinimum) {
    const ack = pickAck(answeredKeys.size);
    assistantMessage =
      `${ack}Ya tenés lo mínimo para generar campañas. ` +
      `Podés finalizar cuando quieras desde el panel, o seguimos afinando el perfil. ` +
      `${QUESTION_BY_KEY[nextKey].prompt}`;
  } else {
    const ack = skipped
      ? 'Dale, lo dejamos para más adelante. '
      : pickAck(answeredKeys.size);
    const summary =
      answeredKeys.size > 0 && answeredKeys.size % 4 === 0
        ? buildShortSummary(session) + ' '
        : '';
    assistantMessage = `${ack}${summary}${QUESTION_BY_KEY[nextKey].prompt}`;
  }

  return {
    assistantMessage,
    nextQuestionKey: nextKey,
    profilePatch: {},
    completedBlocks: session.completedBlocks,
    missingFields: session.profile.metadata.missingFields,
    shouldComplete: complete
  };
}

const ACKS = [
  '¡Buenísimo! ',
  'Genial, anotado. ',
  'Perfecto. ',
  'Gracias por contarme. ',
  'Clarísimo. '
];

function pickAck(n: number): string {
  return ACKS[n % ACKS.length];
}

function buildShortSummary(session: OnboardingSession): string {
  const p = session.profile;
  const bits: string[] = [];
  if (p.organization.name) bits.push(`son ${p.organization.name}`);
  if (p.organization.cause) bits.push(`trabajan en ${p.organization.cause}`);
  if (p.fundraising.currentMethods.length)
    bits.push(`recaudan vía ${p.fundraising.currentMethods.join(', ')}`);
  if (!bits.length) return '';
  return `Hasta acá entiendo que ${bits.join('; ')}.`;
}

/* ------------------------------------------------------------------ */
/* LLM engine (provider-agnostic via fetch)                            */
/* ------------------------------------------------------------------ */

async function runLlmTurn(
  session: OnboardingSession,
  userMessage: string,
  attachmentContext: string
): Promise<AgentTurnResult> {
  const system = buildTextAgentSystemPrompt();
  const stateContext = buildStateContext(session);
  const userContent = [stateContext, attachmentContext, `Usuario: ${userMessage}`]
    .filter(Boolean)
    .join('\n\n');

  const raw = process.env.ANTHROPIC_API_KEY
    ? await callAnthropic(system, session, userContent)
    : await callOpenAI(system, session, userContent);

  const parsed = parseAgentJson(raw);

  // Apply LLM patch then deterministic safety net, then refresh metadata.
  if (parsed.profilePatch && Object.keys(parsed.profilePatch).length) {
    session.profile = mergeProfile(session.profile, parsed.profilePatch);
  }
  if (session.currentQuestionKey) {
    session.profile = mergeProfile(
      session.profile,
      patchFromAnswer(session.currentQuestionKey, userMessage)
    );
  }
  refreshDerivedMetadata(session);

  const answeredKeys = new Set(Object.keys(session.answers));
  return {
    assistantMessage: parsed.assistantMessage,
    nextQuestionKey: parsed.nextQuestionKey ?? null,
    profilePatch: parsed.profilePatch ?? {},
    completedBlocks: session.completedBlocks,
    missingFields: session.profile.metadata.missingFields,
    shouldComplete: Boolean(parsed.shouldComplete) && canComplete(answeredKeys)
  };
}

function buildStateContext(session: OnboardingSession): string {
  return [
    `[estado] question_key_actual: ${session.currentQuestionKey ?? 'ninguna'}`,
    `[estado] bloques_completados: ${session.completedBlocks.join(', ') || 'ninguno'}`,
    `[estado] campos_faltantes: ${session.profile.metadata.missingFields.join(', ') || 'ninguno'}`
  ].join('\n');
}

type ProviderMessage = { role: 'user' | 'assistant'; content: string };

function transcriptToMessages(session: OnboardingSession): ProviderMessage[] {
  return session.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
}

async function callAnthropic(
  system: string,
  session: OnboardingSession,
  userContent: string
): Promise<string> {
  const model = process.env.ONBOARDING_LLM_MODEL || 'claude-sonnet-4-6';
  const history = transcriptToMessages(session);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY as string,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: [...history, { role: 'user', content: userContent }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.content?.[0]?.text ?? '';
}

async function callOpenAI(
  system: string,
  session: OnboardingSession,
  userContent: string
): Promise<string> {
  const model = process.env.ONBOARDING_LLM_MODEL || 'gpt-4o-mini';
  const history = transcriptToMessages(session);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        ...history,
        { role: 'user', content: userContent }
      ]
    })
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

/** Extracts and validates the JSON turn result from raw model output. */
function parseAgentJson(
  raw: string
): Partial<AgentTurnResult> & { assistantMessage: string } {
  const jsonStr = extractJsonBlock(raw);
  const parsed = JSON.parse(jsonStr) as Partial<AgentTurnResult>;
  if (typeof parsed.assistantMessage !== 'string') {
    throw new Error('Agent JSON missing assistantMessage');
  }
  return { ...parsed, assistantMessage: parsed.assistantMessage };
}

function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw.trim();
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export function buildAttachmentContext(attachments: ChatAttachment[]): string {
  if (!attachments.length) return '';
  const lines = attachments.map((a, i) => {
    const preview = a.extractedText
      ? `texto extraído parcial:\n"${a.extractedText.slice(0, 1500)}"`
      : 'extracción pendiente';
    return `${i + 1}. ${a.fileName} — ${a.mimeType} — ${preview}`;
  });
  return `El usuario adjuntó los siguientes archivos:\n${lines.join(
    '\n'
  )}\n\nUsá estos archivos como contexto para responder.`;
}

export { ONBOARDING_QUESTIONS };

/** Confidence helper exported for voice tools. */
export function normalizeConfidence(value?: string): Confidence {
  return value === 'low' || value === 'high' ? value : 'medium';
}
