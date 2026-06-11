import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
};

export const campaignDrafts = pgTable(
  'campaign_drafts',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    orgSlug: text('org_slug').notNull(),
    type: text('type').notNull().default('object_collection'),
    status: text('status').notNull().default('collecting_context'),
    version: integer('version').notNull().default(1),
    title: text('title').notNull().default('Colecta solidaria'),
    currentQuestionKey: text('current_question_key'),
    answers: jsonb('answers').notNull().default({}),
    structured: jsonb('structured').notNull().default({}),
    progress: jsonb('progress').notNull().default({}),
    safety: jsonb('safety').notNull().default({}),
    campaignId: text('campaign_id'),
    publishedSlug: text('published_slug'),
    ...timestamps
  },
  (t) => ({ orgIdx: index('campaign_drafts_org_idx').on(t.orgId) })
);

export const campaignAnswers = pgTable(
  'campaign_answers',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    campaignDraftId: text('campaign_draft_id').notNull(),
    questionKey: text('question_key').notNull(),
    answer: text('answer').notNull(),
    confidence: text('confidence').notNull().default('medium'),
    ...timestamps
  },
  (t) => ({ draftIdx: index('campaign_answers_draft_idx').on(t.campaignDraftId) })
);

export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    campaignDraftId: text('campaign_draft_id').notNull(),
    channel: text('channel').notNull(),
    currentStep: text('current_step').notNull().default('campaign.goal'),
    status: text('status').notNull().default('active'),
    transcript: jsonb('transcript').notNull().default([]),
    ...timestamps
  },
  (t) => ({ draftIdx: index('agent_sessions_draft_idx').on(t.campaignDraftId) })
);

export const agentToolCalls = pgTable(
  'agent_tool_calls',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    campaignDraftId: text('campaign_draft_id'),
    sessionId: text('session_id'),
    tool: text('tool').notNull(),
    input: jsonb('input').notNull().default({}),
    output: jsonb('output').notNull().default({}),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ draftIdx: index('agent_tool_calls_draft_idx').on(t.campaignDraftId) })
);

export const beneficiaryGroups = pgTable('beneficiary_groups', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull(), campaignDraftId: text('campaign_draft_id').notNull(), name: text('name').notNull(), estimatedCount: integer('estimated_count').notNull().default(0), needs: text('needs').notNull().default(''), privacyLevel: text('privacy_level').notNull().default('aggregate_public'), publicSummary: text('public_summary'), ...timestamps
}, (t) => ({ draftIdx: index('beneficiary_groups_draft_idx').on(t.campaignDraftId) }));

export const beneficiaries = pgTable('beneficiaries', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull(), campaignDraftId: text('campaign_draft_id').notNull(), groupId: text('group_id'), displayCode: text('display_code').notNull(), privateData: jsonb('private_data').notNull().default({}), publicSummary: text('public_summary'), priority: text('priority'), status: text('status').notNull().default('private_draft'), hasMinor: boolean('has_minor').notNull().default(false), hasPhotoPermission: boolean('has_photo_permission').notNull().default(false), privacyLevel: text('privacy_level').notNull().default('private'), ...timestamps
}, (t) => ({ draftIdx: index('beneficiaries_draft_idx').on(t.campaignDraftId), statusIdx: index('beneficiaries_status_idx').on(t.status) }));

export const collaborators = pgTable('collaborators', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull(), campaignDraftId: text('campaign_draft_id').notNull(), name: text('name').notNull(), email: text('email'), phone: text('phone'), consentToContact: boolean('consent_to_contact').notNull().default(false), source: text('source').notNull().default('agent'), ...timestamps
}, (t) => ({ draftIdx: index('collaborators_draft_idx').on(t.campaignDraftId) }));

export const contributions = pgTable('contributions', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull(), campaignDraftId: text('campaign_draft_id').notNull(), collaboratorId: text('collaborator_id'), beneficiaryId: text('beneficiary_id'), receptionPointId: text('reception_point_id'), items: text('items').notNull(), quantity: integer('quantity'), status: text('status').notNull().default('committed'), dueDate: text('due_date'), notes: text('notes'), ...timestamps
}, (t) => ({ draftIdx: index('contributions_draft_idx').on(t.campaignDraftId), statusIdx: index('contributions_status_idx').on(t.status) }));

export const receptionPoints = pgTable('reception_points', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull(), campaignDraftId: text('campaign_draft_id').notNull(), name: text('name').notNull(), address: text('address').notNull(), schedule: text('schedule').notNull(), responsibleName: text('responsible_name'), responsibleContact: text('responsible_contact'), publicContact: boolean('public_contact').notNull().default(false), ...timestamps
}, (t) => ({ draftIdx: index('reception_points_draft_idx').on(t.campaignDraftId) }));

export const campaignMessages = pgTable('campaign_messages', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull(), campaignDraftId: text('campaign_draft_id').notNull(), channel: text('channel').notNull(), purpose: text('purpose').notNull(), audience: text('audience').notNull(), body: text('body').notNull(), status: text('status').notNull().default('draft'), ...timestamps
}, (t) => ({ draftIdx: index('campaign_messages_draft_idx').on(t.campaignDraftId) }));

export const pageSections = pgTable('page_sections', {
  id: text('id').primaryKey(), orgId: text('org_id').notNull(), campaignDraftId: text('campaign_draft_id').notNull(), type: text('type').notNull(), title: text('title').notNull(), content: text('content').notNull(), ctaLabel: text('cta_label'), ctaHref: text('cta_href'), sourceQuestionKeys: jsonb('source_question_keys').notNull().default([]), missingData: jsonb('missing_data').notNull().default([]), order: integer('order').notNull().default(0), public: boolean('public').notNull().default(true), ...timestamps
}, (t) => ({ draftIdx: index('page_sections_draft_idx').on(t.campaignDraftId) }));
