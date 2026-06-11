import 'server-only';
import {
  CAMPAIGN_QUESTION_BY_KEY,
  getFirstCampaignQuestionKey,
  getNextCampaignQuestionKey
} from './questions';
import { createSession, getCampaignState } from './store';
import { runCampaignAgentTool } from './tools';

export async function startCampaignAgentSession(ctx: { orgId: string; orgSlug: string }, draftId: string) {
  const session = await createSession({ draftId, channel: 'text_chat' });
  const firstKey = getFirstCampaignQuestionKey();
  return {
    session,
    assistantMessage: CAMPAIGN_QUESTION_BY_KEY[firstKey].prompt,
    questionKey: firstKey
  };
}

export async function runCampaignAgentTurn(
  ctx: { orgId: string; orgSlug: string; source: 'browser' },
  params: { campaignDraftId: string; message: string; expectedVersion?: number }
) {
  const state = await getCampaignState(params.campaignDraftId);
  if (!state || state.draft.orgId !== ctx.orgId) {
    return { ok: false as const, status: 404, error: 'Campaign draft not found' };
  }

  const questionKey = state.draft.currentQuestionKey ?? getFirstCampaignQuestionKey();
  const save = await runCampaignAgentTool(ctx, {
    tool: 'save_campaign_answer',
    args: {
      campaignDraftId: params.campaignDraftId,
      questionKey,
      answer: params.message,
      confidence: 'medium',
      expectedVersion: params.expectedVersion ?? state.draft.version
    }
  });

  if (!save.ok) {
    if (save.error === 'VERSION_CONFLICT') {
      return {
        ok: true as const,
        conflict: true,
        assistantMessage: 'Hubo cambios en el borrador, ya lo actualicé. Sigamos desde la última versión.',
        state: save.details && typeof save.details === 'object' && 'latest' in save.details ? (save.details as any).latest : state
      };
    }
    return save;
  }

  const nextState = await getCampaignState(params.campaignDraftId);
  if (!nextState) return { ok: false as const, status: 404, error: 'Campaign draft not found' };

  const answered = new Set(Object.keys(nextState.draft.answers));
  const nextQuestionKey = getNextCampaignQuestionKey(answered, questionKey);
  const assistantMessage = nextQuestionKey
    ? buildAck(answered.size) + CAMPAIGN_QUESTION_BY_KEY[nextQuestionKey].prompt
    : 'Perfecto. Ya tengo la base operativa de la colecta. Ahora podés generar mensajes, revisar la página básica y marcarla lista para publicar.';

  return {
    ok: true as const,
    assistantMessage,
    questionKey: nextQuestionKey,
    state: nextState
  };
}

function buildAck(count: number) {
  if (count % 4 === 0) return 'Bien, ya estamos reduciendo seguimiento manual. ';
  return ['Perfecto. ', 'Anotado. ', 'Buenísimo. '][count % 3];
}
