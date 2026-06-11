export const CAMPAIGN_TYPES = ['object_collection'] as const;
export type CampaignAgentType = (typeof CAMPAIGN_TYPES)[number];

export const DRAFT_STATUSES = [
  'collecting_context',
  'ops_ready',
  'page_ready',
  'qa_review',
  'ready_to_publish',
  'published'
] as const;
export type CampaignDraftStatus = (typeof DRAFT_STATUSES)[number];

export const CONTRIBUTION_STATUSES = [
  'committed',
  'pending',
  'received',
  'delivered',
  'cancelled'
] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export const BENEFICIARY_STATUSES = [
  'private_draft',
  'available',
  'assigned',
  'fulfilled',
  'hidden'
] as const;
export type BeneficiaryStatus = (typeof BENEFICIARY_STATUSES)[number];

export type PrivacyLevel = 'private' | 'aggregate_public' | 'public_with_consent';
export type AgentChannel = 'text_chat' | 'voice_agent' | 'system';
export type CampaignMessageChannel = 'whatsapp' | 'email' | 'instagram' | 'facebook' | 'web';
export type CampaignMessagePurpose =
  | 'signup_confirmation'
  | 'reminder'
  | 'no_delivery'
  | 'received_confirmation'
  | 'completion'
  | 'public_social_post';

export type CampaignAnswers = Record<
  string,
  { answer: string; confidence: 'low' | 'medium' | 'high'; at: string }
>;

export type CampaignDraftStructured = {
  title?: string;
  collectedItems?: string;
  beneficiarySummary?: string;
  targetCount?: number;
  deadline?: string;
  deliveryDate?: string;
  deliveryLocation?: string;
  signupMode?: string;
  receiptConfirmationMode?: string;
  publicSummary?: string;
  privacyNotes?: string;
  automationsRecommended?: string[];
};

export type CampaignDraft = {
  id: string;
  orgId: string;
  orgSlug: string;
  type: CampaignAgentType;
  status: CampaignDraftStatus;
  version: number;
  title: string;
  currentQuestionKey: string | null;
  answers: CampaignAnswers;
  structured: CampaignDraftStructured;
  progress: {
    answered: number;
    total: number;
    missingQuestionKeys: string[];
  };
  safety: SafetyReview;
  campaignId?: string;
  publishedSlug?: string;
  createdAt: string;
  updatedAt: string;
};

export type SafetyReview = {
  hasSensitiveData: boolean;
  hasMinors: boolean;
  hasPhotoPermissions: boolean;
  publicPrivateReviewed: boolean;
  warnings: string[];
  blockers: string[];
};

export type AgentSession = {
  id: string;
  orgId: string;
  campaignDraftId: string;
  channel: AgentChannel;
  currentStep: string;
  status: 'active' | 'completed';
  transcript: Array<{
    id: string;
    role: 'assistant' | 'user' | 'system';
    content: string;
    questionKey?: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type AgentToolCall = {
  id: string;
  orgId: string;
  campaignDraftId?: string;
  sessionId?: string;
  tool: string;
  input: unknown;
  output: unknown;
  status: 'ok' | 'error';
  createdAt: string;
};

export type BeneficiaryGroup = {
  id: string;
  orgId: string;
  campaignDraftId: string;
  name: string;
  estimatedCount: number;
  needs: string;
  privacyLevel: PrivacyLevel;
  publicSummary?: string;
  createdAt: string;
  updatedAt: string;
};

export type Beneficiary = {
  id: string;
  orgId: string;
  campaignDraftId: string;
  groupId?: string;
  displayCode: string;
  privateData: Record<string, unknown>;
  publicSummary?: string;
  priority?: string;
  status: BeneficiaryStatus;
  hasMinor: boolean;
  hasPhotoPermission: boolean;
  privacyLevel: PrivacyLevel;
  createdAt: string;
  updatedAt: string;
};

export type Collaborator = {
  id: string;
  orgId: string;
  campaignDraftId: string;
  name: string;
  email?: string;
  phone?: string;
  consentToContact: boolean;
  source: 'manual' | 'public_form' | 'agent';
  createdAt: string;
  updatedAt: string;
};

export type Contribution = {
  id: string;
  orgId: string;
  campaignDraftId: string;
  collaboratorId?: string;
  beneficiaryId?: string;
  receptionPointId?: string;
  items: string;
  quantity?: number;
  status: ContributionStatus;
  dueDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReceptionPoint = {
  id: string;
  orgId: string;
  campaignDraftId: string;
  name: string;
  address: string;
  schedule: string;
  responsibleName?: string;
  responsibleContact?: string;
  publicContact: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CampaignMessage = {
  id: string;
  orgId: string;
  campaignDraftId: string;
  channel: CampaignMessageChannel;
  purpose: CampaignMessagePurpose;
  audience: 'collaborators' | 'public' | 'companies' | 'internal';
  body: string;
  status: 'draft' | 'ready' | 'used';
  createdAt: string;
  updatedAt: string;
};

export type PageSection = {
  id: string;
  orgId: string;
  campaignDraftId: string;
  type:
    | 'hero'
    | 'problem'
    | 'goal'
    | 'how_to_help'
    | 'logistics'
    | 'transparency'
    | 'faq'
    | 'cta';
  title: string;
  content: string;
  ctaLabel?: string;
  ctaHref?: string;
  sourceQuestionKeys: string[];
  missingData: string[];
  order: number;
  public: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CampaignState = {
  draft: CampaignDraft;
  beneficiaryGroups: BeneficiaryGroup[];
  beneficiaries: Beneficiary[];
  collaborators: Collaborator[];
  contributions: Contribution[];
  receptionPoints: ReceptionPoint[];
  messages: CampaignMessage[];
  pageSections: PageSection[];
  metrics: {
    generatedMessages: number;
    managedContributions: number;
    pendingContributions: number;
    fulfilledBeneficiaries: number;
  };
};

export type ToolOk<T> = { ok: true; data: T };
export type ToolError = {
  ok: false;
  status: number;
  error:
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'VERSION_CONFLICT'
    | 'SAFETY_BLOCKED'
    | 'MISSING_REQUIRED_ANSWERS'
    | 'UNKNOWN_TOOL';
  message: string;
  details?: unknown;
};
export type ToolResult<T> = ToolOk<T> | ToolError;
