import 'server-only';
import { eq, and } from 'drizzle-orm';
import { getCampaignAgentDb } from './db/client';
import * as tables from './db/schema';
import {
  CAMPAIGN_QUESTIONS,
  computeDraftProgress,
  getFirstCampaignQuestionKey,
  patchStructuredFromAnswer,
  safetyFromAnswers
} from './questions';
import type {
  AgentSession,
  AgentToolCall,
  Beneficiary,
  BeneficiaryGroup,
  CampaignDraft,
  CampaignMessage,
  CampaignState,
  Collaborator,
  Contribution,
  ContributionStatus,
  PageSection,
  ReceptionPoint,
  SafetyReview
} from './types';

type EntityName =
  | 'drafts'
  | 'sessions'
  | 'toolCalls'
  | 'beneficiaryGroups'
  | 'beneficiaries'
  | 'collaborators'
  | 'contributions'
  | 'receptionPoints'
  | 'messages'
  | 'pageSections';

const globalForStore = globalThis as unknown as {
  __campaignAgentMemoryStore?: Record<EntityName, Map<string, any>>;
};

const memory =
  globalForStore.__campaignAgentMemoryStore ??
  (globalForStore.__campaignAgentMemoryStore = {
    drafts: new Map(),
    sessions: new Map(),
    toolCalls: new Map(),
    beneficiaryGroups: new Map(),
    beneficiaries: new Map(),
    collaborators: new Map(),
    contributions: new Map(),
    receptionPoints: new Map(),
    messages: new Map(),
    pageSections: new Map()
  });

function now() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : now();
}

function normalizeDraft(row: any): CampaignDraft {
  return {
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  } as CampaignDraft;
}

function normalizeEntity<T>(row: any): T {
  return {
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  } as T;
}

async function insert(table: any, value: any) {
  const db = getCampaignAgentDb();
  if (!db) return null;
  const [row] = await db.insert(table).values(value).returning();
  return row;
}

async function selectByDraft<T>(table: any, campaignDraftId: string): Promise<T[]> {
  const db = getCampaignAgentDb();
  if (!db) return [];
  const rows = await db.select().from(table).where(eq(table.campaignDraftId, campaignDraftId));
  return rows.map((r: any) => normalizeEntity<T>(r));
}

export async function createDraft(params: {
  orgId: string;
  orgSlug: string;
  title?: string;
}): Promise<CampaignDraft> {
  const created = now();
  const draft: CampaignDraft = {
    id: id(),
    orgId: params.orgId,
    orgSlug: params.orgSlug,
    type: 'object_collection',
    status: 'collecting_context',
    version: 1,
    title: params.title?.trim() || 'Colecta solidaria',
    currentQuestionKey: getFirstCampaignQuestionKey(),
    answers: {},
    structured: { title: params.title?.trim() || 'Colecta solidaria' },
    progress: { answered: 0, total: CAMPAIGN_QUESTIONS.length, missingQuestionKeys: [] },
    safety: {
      hasSensitiveData: false,
      hasMinors: false,
      hasPhotoPermissions: false,
      publicPrivateReviewed: false,
      warnings: [],
      blockers: ['Falta confirmar qué queda público y qué queda privado.']
    },
    createdAt: created,
    updatedAt: created
  };
  draft.progress = computeDraftProgress(draft);

  const row = await insert(tables.campaignDrafts, {
    id: draft.id,
    orgId: draft.orgId,
    orgSlug: draft.orgSlug,
    type: draft.type,
    status: draft.status,
    version: draft.version,
    title: draft.title,
    currentQuestionKey: draft.currentQuestionKey,
    answers: draft.answers,
    structured: draft.structured,
    progress: draft.progress,
    safety: draft.safety
  });
  if (row) return normalizeDraft(row);
  memory.drafts.set(draft.id, draft);
  return draft;
}

export async function getDraft(draftId: string): Promise<CampaignDraft | null> {
  const db = getCampaignAgentDb();
  if (db) {
    const [row] = await db.select().from(tables.campaignDrafts).where(eq(tables.campaignDrafts.id, draftId));
    return row ? normalizeDraft(row) : null;
  }
  return memory.drafts.get(draftId) ?? null;
}

export async function updateDraft(
  draftId: string,
  patch: Partial<CampaignDraft>,
  expectedVersion?: number
): Promise<{ ok: true; draft: CampaignDraft } | { ok: false; latest: CampaignDraft | null }> {
  const current = await getDraft(draftId);
  if (!current) return { ok: false, latest: null };
  if (expectedVersion !== undefined && current.version !== expectedVersion) {
    return { ok: false, latest: current };
  }
  const next: CampaignDraft = {
    ...current,
    ...patch,
    // Identity and ownership are immutable — never let a patch reassign them.
    id: current.id,
    orgId: current.orgId,
    orgSlug: current.orgSlug,
    createdAt: current.createdAt,
    structured: { ...current.structured, ...(patch.structured ?? {}) },
    answers: patch.answers ?? current.answers,
    // version is store-owned (optimistic lock); a patch can never set it.
    version: current.version + 1,
    updatedAt: now()
  };
  next.progress = computeDraftProgress(next);
  // safety is always derived from answers — never accepted from the caller,
  // otherwise a patch could clear blockers and bypass the publish gate.
  next.safety = safetyFromAnswers(next.answers);
  next.title = next.structured.title ?? next.title;

  const db = getCampaignAgentDb();
  if (db) {
    const [row] = await db
      .update(tables.campaignDrafts)
      .set({
        status: next.status,
        version: next.version,
        title: next.title,
        currentQuestionKey: next.currentQuestionKey,
        answers: next.answers,
        structured: next.structured,
        progress: next.progress,
        safety: next.safety,
        campaignId: next.campaignId,
        publishedSlug: next.publishedSlug,
        updatedAt: new Date()
      })
      .where(and(eq(tables.campaignDrafts.id, draftId), eq(tables.campaignDrafts.version, current.version)))
      .returning();
    if (!row) return { ok: false, latest: await getDraft(draftId) };
    return { ok: true, draft: normalizeDraft(row) };
  }
  memory.drafts.set(draftId, next);
  return { ok: true, draft: next };
}

export async function saveAnswer(params: {
  draftId: string;
  questionKey: string;
  answer: string;
  confidence?: 'low' | 'medium' | 'high';
  expectedVersion?: number;
}) {
  const draft = await getDraft(params.draftId);
  if (!draft) return { ok: false as const, latest: null };
  const answers = {
    ...draft.answers,
    [params.questionKey]: {
      answer: params.answer,
      confidence: params.confidence ?? 'medium',
      at: now()
    }
  };
  const structured = patchStructuredFromAnswer(params.questionKey, params.answer);
  const result = await updateDraft(
    params.draftId,
    { answers, structured },
    params.expectedVersion
  );
  if (!result.ok) return result;

  const row = {
    id: id(),
    orgId: result.draft.orgId,
    campaignDraftId: params.draftId,
    questionKey: params.questionKey,
    answer: params.answer,
    confidence: params.confidence ?? 'medium',
    createdAt: now(),
    updatedAt: now()
  };
  const inserted = await insert(tables.campaignAnswers, row);
  if (!inserted) memory.toolCalls.set(`answer:${row.id}`, row);
  return result;
}

async function createEntity<T extends { id: string; campaignDraftId: string; orgId: string; createdAt: string; updatedAt: string }>(
  map: Map<string, any>,
  table: any,
  draftId: string,
  values: Omit<T, 'id' | 'orgId' | 'campaignDraftId' | 'createdAt' | 'updatedAt'>
): Promise<T | null> {
  const draft = await getDraft(draftId);
  if (!draft) return null;
  const entity = { id: id(), orgId: draft.orgId, campaignDraftId: draftId, ...values, createdAt: now(), updatedAt: now() } as T;
  const inserted = await insert(table, entity);
  if (inserted) return normalizeEntity<T>(inserted);
  map.set(entity.id, entity);
  return entity;
}

export const createBeneficiaryGroup = (draftId: string, values: Omit<BeneficiaryGroup, 'id' | 'orgId' | 'campaignDraftId' | 'createdAt' | 'updatedAt'>) =>
  createEntity<BeneficiaryGroup>(memory.beneficiaryGroups, tables.beneficiaryGroups, draftId, values);
export const createBeneficiary = (draftId: string, values: Omit<Beneficiary, 'id' | 'orgId' | 'campaignDraftId' | 'createdAt' | 'updatedAt'>) =>
  createEntity<Beneficiary>(memory.beneficiaries, tables.beneficiaries, draftId, values);
export const createCollaborator = (draftId: string, values: Omit<Collaborator, 'id' | 'orgId' | 'campaignDraftId' | 'createdAt' | 'updatedAt'>) =>
  createEntity<Collaborator>(memory.collaborators, tables.collaborators, draftId, values);
export const createContribution = (draftId: string, values: Omit<Contribution, 'id' | 'orgId' | 'campaignDraftId' | 'createdAt' | 'updatedAt'>) =>
  createEntity<Contribution>(memory.contributions, tables.contributions, draftId, values);
export const createReceptionPoint = (draftId: string, values: Omit<ReceptionPoint, 'id' | 'orgId' | 'campaignDraftId' | 'createdAt' | 'updatedAt'>) =>
  createEntity<ReceptionPoint>(memory.receptionPoints, tables.receptionPoints, draftId, values);
export const createCampaignMessage = (draftId: string, values: Omit<CampaignMessage, 'id' | 'orgId' | 'campaignDraftId' | 'createdAt' | 'updatedAt'>) =>
  createEntity<CampaignMessage>(memory.messages, tables.campaignMessages, draftId, values);
export const createPageSection = (draftId: string, values: Omit<PageSection, 'id' | 'orgId' | 'campaignDraftId' | 'createdAt' | 'updatedAt'>) =>
  createEntity<PageSection>(memory.pageSections, tables.pageSections, draftId, values);

export async function updateContributionStatus(draftId: string, contributionId: string, status: ContributionStatus) {
  const current = (await listContributions(draftId)).find((c) => c.id === contributionId);
  if (!current) return null;
  const next = { ...current, status, updatedAt: now() };
  const db = getCampaignAgentDb();
  if (db) {
    const [row] = await db.update(tables.contributions).set({ status, updatedAt: new Date() }).where(eq(tables.contributions.id, contributionId)).returning();
    return row ? normalizeEntity<Contribution>(row) : null;
  }
  memory.contributions.set(contributionId, next);
  return next;
}

function listMemory<T>(map: Map<string, any>, draftId: string): T[] {
  return Array.from(map.values()).filter((e) => e.campaignDraftId === draftId) as T[];
}

export async function listBeneficiaryGroups(draftId: string) { return getCampaignAgentDb() ? selectByDraft<BeneficiaryGroup>(tables.beneficiaryGroups, draftId) : listMemory<BeneficiaryGroup>(memory.beneficiaryGroups, draftId); }
export async function listBeneficiaries(draftId: string) { return getCampaignAgentDb() ? selectByDraft<Beneficiary>(tables.beneficiaries, draftId) : listMemory<Beneficiary>(memory.beneficiaries, draftId); }
export async function listCollaborators(draftId: string) { return getCampaignAgentDb() ? selectByDraft<Collaborator>(tables.collaborators, draftId) : listMemory<Collaborator>(memory.collaborators, draftId); }
export async function listContributions(draftId: string) { return getCampaignAgentDb() ? selectByDraft<Contribution>(tables.contributions, draftId) : listMemory<Contribution>(memory.contributions, draftId); }
export async function listReceptionPoints(draftId: string) { return getCampaignAgentDb() ? selectByDraft<ReceptionPoint>(tables.receptionPoints, draftId) : listMemory<ReceptionPoint>(memory.receptionPoints, draftId); }
export async function listMessages(draftId: string) { return getCampaignAgentDb() ? selectByDraft<CampaignMessage>(tables.campaignMessages, draftId) : listMemory<CampaignMessage>(memory.messages, draftId); }
export async function listPageSections(draftId: string) { return getCampaignAgentDb() ? selectByDraft<PageSection>(tables.pageSections, draftId) : listMemory<PageSection>(memory.pageSections, draftId); }

export async function getCampaignState(draftId: string): Promise<CampaignState | null> {
  const draft = await getDraft(draftId);
  if (!draft) return null;
  const [beneficiaryGroups, beneficiaries, collaborators, contributions, receptionPoints, messages, pageSections] = await Promise.all([
    listBeneficiaryGroups(draftId), listBeneficiaries(draftId), listCollaborators(draftId), listContributions(draftId), listReceptionPoints(draftId), listMessages(draftId), listPageSections(draftId)
  ]);
  return {
    draft,
    beneficiaryGroups,
    beneficiaries,
    collaborators,
    contributions,
    receptionPoints,
    messages,
    pageSections,
    metrics: {
      generatedMessages: messages.length,
      managedContributions: contributions.length,
      pendingContributions: contributions.filter((c) => c.status === 'pending' || c.status === 'committed').length,
      fulfilledBeneficiaries: beneficiaries.filter((b) => b.status === 'fulfilled').length
    }
  };
}

export async function appendToolCall(call: Omit<AgentToolCall, 'id' | 'createdAt'>) {
  const row: AgentToolCall = { ...call, id: id(), createdAt: now() };
  const inserted = await insert(tables.agentToolCalls, row);
  if (!inserted) memory.toolCalls.set(row.id, row);
  return row;
}

export async function createSession(params: { draftId: string; channel: AgentSession['channel'] }): Promise<AgentSession | null> {
  const draft = await getDraft(params.draftId);
  if (!draft) return null;
  const session: AgentSession = {
    id: id(),
    orgId: draft.orgId,
    campaignDraftId: draft.id,
    channel: params.channel,
    currentStep: draft.currentQuestionKey ?? getFirstCampaignQuestionKey(),
    status: 'active',
    transcript: [],
    createdAt: now(),
    updatedAt: now()
  };
  const inserted = await insert(tables.agentSessions, session);
  if (inserted) return normalizeEntity<AgentSession>(inserted);
  memory.sessions.set(session.id, session);
  return session;
}
