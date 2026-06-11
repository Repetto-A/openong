import 'server-only';
import type { Data } from '@puckeditor/core';
import { addCampaign, slugify } from '@/lib/campaigns';
import { savePageData } from '@/lib/pages';
import { getOrgProfile } from '@/lib/onboarding/org-store';
import {
  CAMPAIGN_QUESTION_BY_KEY,
  computeDraftProgress,
  getNextCampaignQuestionKey
} from './questions';
import {
  appendToolCall,
  createBeneficiary,
  createBeneficiaryGroup,
  createCampaignMessage,
  createCollaborator,
  createContribution,
  createDraft,
  createPageSection,
  createReceptionPoint,
  getCampaignState,
  getDraft,
  listContributions,
  saveAnswer,
  updateContributionStatus,
  updateDraft
} from './store';
import { buildBasicPageSections, pageSectionsToPuckData } from './page-builder';
import { CONTRIBUTION_STATUSES } from './types';
import type {
  CampaignDraft,
  CampaignState,
  ToolError,
  ToolResult
} from './types';

const MESSAGE_CHANNELS = ['whatsapp', 'email', 'instagram', 'facebook', 'web'] as const;
const MESSAGE_PURPOSES = ['signup_confirmation', 'reminder', 'no_delivery', 'received_confirmation', 'completion', 'public_social_post'] as const;
const MESSAGE_AUDIENCES = ['collaborators', 'public', 'companies', 'internal'] as const;
const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;

type ToolContext = {
  orgId: string;
  orgSlug: string;
  source: 'browser' | 'voice';
};

type ToolInput = { tool: string; args?: Record<string, unknown> };

function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

function error(error: ToolError['error'], message: string, status = 400, details?: unknown): ToolError {
  return { ok: false, error, message, status, details };
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Coerce an untrusted value to one of `allowed`, falling back when it isn't a match. */
function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const s = typeof value === 'string' ? value.trim() : '';
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

async function ensureOwnedDraft(ctx: ToolContext, draftId: string) {
  if (!draftId) return null;
  const draft = await getDraft(draftId);
  if (!draft || draft.orgId !== ctx.orgId) return null;
  return draft;
}

async function withAudit(ctx: ToolContext, tool: string, args: Record<string, unknown>, run: () => Promise<ToolResult<unknown>>): Promise<ToolResult<unknown>> {
  const result = await run();
  await appendToolCall({
    orgId: ctx.orgId,
    campaignDraftId: str(args.campaignDraftId) || str(args.draftId) || undefined,
    sessionId: str(args.sessionId) || undefined,
    tool,
    input: args,
    output: result.ok ? result.data : result,
    status: result.ok ? 'ok' : 'error'
  });
  return result;
}

export async function runCampaignAgentTool(ctx: ToolContext, input: ToolInput): Promise<ToolResult<unknown>> {
  const args = input.args ?? {};
  return withAudit(ctx, input.tool, args, async () => {
    switch (input.tool) {
      case 'get_organization_profile': {
        const profile = await getOrgProfile(ctx.orgId);
        return ok({ profile, summary: profile ? `${profile.organization.name}: ${profile.organization.oneLiner || profile.organization.cause}` : null });
      }
      case 'create_campaign_draft': {
        const draft = await createDraft({ orgId: ctx.orgId, orgSlug: ctx.orgSlug, title: str(args.title, 'Colecta solidaria') });
        return ok({ draft });
      }
      case 'get_campaign_state': {
        const draftId = str(args.campaignDraftId);
        const draft = await ensureOwnedDraft(ctx, draftId);
        if (!draft) return error('NOT_FOUND', 'Campaign draft not found', 404);
        return ok(await getCampaignState(draftId));
      }
      case 'save_campaign_answer': {
        const draftId = str(args.campaignDraftId);
        const questionKey = str(args.questionKey);
        const answer = str(args.answer);
        if (!CAMPAIGN_QUESTION_BY_KEY[questionKey]) return error('VALIDATION_ERROR', `Unknown questionKey: ${questionKey}`, 422);
        if (!answer) return error('VALIDATION_ERROR', 'answer is required', 422);
        const draft = await ensureOwnedDraft(ctx, draftId);
        if (!draft) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const saved = await saveAnswer({ draftId, questionKey, answer, confidence: pick(args.confidence, CONFIDENCE_LEVELS, 'medium'), expectedVersion: args.expectedVersion as number | undefined });
        if (!saved.ok) return error('VERSION_CONFLICT', 'Draft changed while saving; use latest draft.', 409, { latest: saved.latest });
        const answered = new Set(Object.keys(saved.draft.answers));
        const nextQuestionKey = getNextCampaignQuestionKey(answered, questionKey);
        const updated = await updateDraft(draftId, { currentQuestionKey: nextQuestionKey }, saved.draft.version);
        if (!updated.ok) return error('VERSION_CONFLICT', 'Draft changed while advancing question.', 409, { latest: updated.latest });
        return ok({ draft: updated.draft, nextQuestionKey });
      }
      case 'update_campaign_draft': {
        const draftId = str(args.campaignDraftId);
        const draft = await ensureOwnedDraft(ctx, draftId);
        if (!draft) return error('NOT_FOUND', 'Campaign draft not found', 404);
        // Only content fields are editable through this tool. Control state
        // (status, safety, version, orgId) is owned by the store and dedicated
        // transitions, and must never be set from an LLM-supplied patch.
        // TODO: replace this manual allowlist with an EditableDraftFields type
        // once there is more than one untrusted entry point into updateDraft.
        const raw = (args.patch ?? {}) as Record<string, unknown>;
        const patch: Partial<CampaignDraft> = {};
        const title = str(raw.title);
        if (title) patch.title = title;
        if (raw.structured && typeof raw.structured === 'object') {
          patch.structured = raw.structured as CampaignDraft['structured'];
        }
        const updated = await updateDraft(draftId, patch, args.expectedVersion as number | undefined);
        if (!updated.ok) return error('VERSION_CONFLICT', 'Draft changed while updating.', 409, { latest: updated.latest });
        return ok({ draft: updated.draft });
      }
      case 'suggest_campaign_types': {
        return ok({ suggestions: [{ type: 'object_collection', label: 'Colecta de objetos', reason: 'Es el primer MVP porque reduce WhatsApp, planillas y seguimiento manual desde el día uno.' }] });
      }
      case 'create_beneficiary_group': {
        const draftId = str(args.campaignDraftId);
        if (!(await ensureOwnedDraft(ctx, draftId))) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const group = await createBeneficiaryGroup(draftId, { name: str(args.name, 'Grupo de beneficiarios'), estimatedCount: num(args.estimatedCount), needs: str(args.needs), privacyLevel: 'aggregate_public', publicSummary: str(args.publicSummary) || undefined });
        return ok({ group });
      }
      case 'create_beneficiary': {
        const draftId = str(args.campaignDraftId);
        if (!(await ensureOwnedDraft(ctx, draftId))) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const beneficiary = await createBeneficiary(draftId, { groupId: str(args.groupId) || undefined, displayCode: str(args.displayCode, `B-${Date.now().toString().slice(-5)}`), privateData: (args.privateData ?? {}) as Record<string, unknown>, publicSummary: str(args.publicSummary) || undefined, priority: str(args.priority) || undefined, status: 'private_draft', hasMinor: bool(args.hasMinor), hasPhotoPermission: bool(args.hasPhotoPermission), privacyLevel: 'private' });
        return ok({ beneficiary });
      }
      case 'create_reception_point': {
        const draftId = str(args.campaignDraftId);
        if (!(await ensureOwnedDraft(ctx, draftId))) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const point = await createReceptionPoint(draftId, { name: str(args.name, 'Punto de recepción'), address: str(args.address), schedule: str(args.schedule), responsibleName: str(args.responsibleName) || undefined, responsibleContact: str(args.responsibleContact) || undefined, publicContact: bool(args.publicContact) });
        return ok({ point });
      }
      case 'create_collaborator': {
        const draftId = str(args.campaignDraftId);
        if (!(await ensureOwnedDraft(ctx, draftId))) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const collaborator = await createCollaborator(draftId, { name: str(args.name, 'Colaborador/a'), email: str(args.email) || undefined, phone: str(args.phone) || undefined, consentToContact: bool(args.consentToContact, true), source: 'agent' });
        return ok({ collaborator });
      }
      case 'create_contribution': {
        const draftId = str(args.campaignDraftId);
        if (!(await ensureOwnedDraft(ctx, draftId))) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const contribution = await createContribution(draftId, { collaboratorId: str(args.collaboratorId) || undefined, beneficiaryId: str(args.beneficiaryId) || undefined, receptionPointId: str(args.receptionPointId) || undefined, items: str(args.items), quantity: args.quantity as number | undefined, status: pick(args.status, CONTRIBUTION_STATUSES, 'committed'), dueDate: str(args.dueDate) || undefined, notes: str(args.notes) || undefined });
        return ok({ contribution });
      }
      case 'update_contribution_status': {
        const draftId = str(args.campaignDraftId);
        if (!(await ensureOwnedDraft(ctx, draftId))) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const contribution = await updateContributionStatus(draftId, str(args.contributionId), pick(args.status, CONTRIBUTION_STATUSES, 'pending'));
        if (!contribution) return error('NOT_FOUND', 'Contribution not found', 404);
        return ok({ contribution });
      }
      case 'list_pending_contributions': {
        const draftId = str(args.campaignDraftId);
        if (!(await ensureOwnedDraft(ctx, draftId))) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const contributions = (await listContributions(draftId)).filter((c) => c.status === 'pending' || c.status === 'committed');
        return ok({ contributions });
      }
      case 'create_campaign_message': {
        const draftId = str(args.campaignDraftId);
        if (!(await ensureOwnedDraft(ctx, draftId))) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const message = await createCampaignMessage(draftId, { channel: pick(args.channel, MESSAGE_CHANNELS, 'whatsapp'), purpose: pick(args.purpose, MESSAGE_PURPOSES, 'signup_confirmation'), audience: pick(args.audience, MESSAGE_AUDIENCES, 'collaborators'), body: str(args.body), status: 'draft' });
        return ok({ message });
      }
      case 'generate_campaign_messages': {
        const draftId = str(args.campaignDraftId);
        const state = await getCampaignState(draftId);
        if (!state || state.draft.orgId !== ctx.orgId) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const messages = await generateMessages(draftId, state);
        return ok({ messages });
      }
      case 'generate_basic_page_sections': {
        const draftId = str(args.campaignDraftId);
        const state = await getCampaignState(draftId);
        if (!state || state.draft.orgId !== ctx.orgId) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const sections = await buildBasicPageSections(state);
        for (const section of sections) await createPageSection(draftId, section as never);
        const updated = await updateDraft(draftId, { status: 'page_ready' }, state.draft.version);
        return ok({ sections, draft: updated.ok ? updated.draft : state.draft });
      }
      case 'mark_campaign_ready': {
        const draftId = str(args.campaignDraftId);
        const state = await getCampaignState(draftId);
        if (!state || state.draft.orgId !== ctx.orgId) return error('NOT_FOUND', 'Campaign draft not found', 404);
        const progress = computeDraftProgress(state.draft);
        if (progress.missingQuestionKeys.length) return error('MISSING_REQUIRED_ANSWERS', 'Missing required answers', 422, { missingQuestionKeys: progress.missingQuestionKeys });
        if (state.draft.safety.blockers.length) return error('SAFETY_BLOCKED', 'Safety review has blockers', 422, { blockers: state.draft.safety.blockers });
        const updated = await updateDraft(draftId, { status: 'ready_to_publish' }, state.draft.version);
        if (!updated.ok) return error('VERSION_CONFLICT', 'Draft changed while marking ready.', 409, { latest: updated.latest });
        return ok({ draft: updated.draft });
      }
      case 'publish_campaign': {
        const draftId = str(args.campaignDraftId);
        const confirm = bool(args.confirm);
        const state = await getCampaignState(draftId);
        if (!state || state.draft.orgId !== ctx.orgId) return error('NOT_FOUND', 'Campaign draft not found', 404);
        if (!confirm) return error('VALIDATION_ERROR', 'publish_campaign requires confirm=true', 422);
        if (state.draft.safety.blockers.length) return error('SAFETY_BLOCKED', 'Cannot publish with safety blockers', 422, { blockers: state.draft.safety.blockers });
        const slug = slugify(str(args.slug) || state.draft.title || 'colecta-solidaria');
        const pageData: Data = pageSectionsToPuckData(state.pageSections.length ? state.pageSections : await buildBasicPageSections(state));
        await addCampaign(ctx.orgId, { slug, title: state.draft.title, type: 'object_collection', prompt: 'Generated by Campaign Agent structured tools', status: 'sent', createdAt: Date.now() });
        await savePageData(ctx.orgId, slug, pageData);
        const updated = await updateDraft(draftId, { status: 'published', publishedSlug: slug, campaignId: slug }, state.draft.version);
        return ok({ url: `/${slug}`, slug, draft: updated.ok ? updated.draft : state.draft });
      }
      default:
        return error('UNKNOWN_TOOL', `Unknown tool: ${input.tool}`, 400);
    }
  });
}

async function generateMessages(draftId: string, state: CampaignState) {
  const title = state.draft.title || 'la colecta';
  const items = state.draft.structured.collectedItems || 'las donaciones';
  const point = state.receptionPoints[0];
  const where = point ? `${point.name}, ${point.address}, ${point.schedule}` : 'el punto de recepción informado por la ONG';
  const bodies = [
    { channel: 'whatsapp', purpose: 'signup_confirmation', audience: 'collaborators', body: `¡Gracias por sumarte a ${title}! Te anotamos para colaborar con ${items}. Podés acercarlo en ${where}.` },
    { channel: 'whatsapp', purpose: 'reminder', audience: 'collaborators', body: `Recordatorio de ${title}: si ya comprometiste tu donación, por favor acercala en ${where}. Si necesitás cambiar algo, avisá por este medio.` },
    { channel: 'whatsapp', purpose: 'received_confirmation', audience: 'collaborators', body: `Recibimos tu donación para ${title}. ¡Gracias por ayudarnos a ordenar esta colecta y llegar a más personas!` },
    { channel: 'instagram', purpose: 'public_social_post', audience: 'public', body: `${title}: estamos recibiendo ${items}. Sumate compartiendo o acercando tu donación. Información y punto de recepción en nuestra página.` }
  ] as const;
  const created = [];
  for (const m of bodies) {
    created.push(await createCampaignMessage(draftId, { ...m, status: 'draft' }));
  }
  return created;
}
