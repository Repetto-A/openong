/**
 * Core domain types for the NGO conversational onboarding feature.
 *
 * The onboarding builds a structured `NgoOnboardingProfile` that downstream
 * modules (crowdfunding landing, solidarity store, street-fundraising guide,
 * comms kit) can later consume to generate assets.
 */

export type DigitalMaturity = 'low' | 'medium' | 'high' | 'unknown';
export type Confidence = 'low' | 'medium' | 'high';
export type OnboardingSource = 'text_chat' | 'voice_agent' | 'mixed';
export type OnboardingStatus = 'in_progress' | 'completed';
export type ProductType = 'physical' | 'symbolic' | 'event' | 'service' | 'other';

export type CampaignRecommendation = {
  id: string;
  type: 'crowdfunding' | 'tienda';
  title: string;
  reason: string;
  promptSeed: string;
};

export type NgoOnboardingProfile = {
  organization: {
    name: string;
    oneLiner: string;
    cause: string;
    location?: string;
    beneficiaries: string;
    website?: string;
    socialLinks?: string[];
  };
  impact: {
    programs: string[];
    metrics: Array<{
      label: string;
      value: string;
      source?: string;
    }>;
    stories: string[];
  };
  fundraising: {
    currentMethods: string[];
    donorTypes: string[];
    recurringDonors?: boolean;
    paymentMethods: string[];
    mainChallenge: string;
    fundingUrgency?: string;
  };
  channels: {
    whatsapp?: boolean;
    instagram?: boolean;
    email?: boolean;
    website?: boolean;
    streetFundraising?: boolean;
    events?: boolean;
    notes?: string;
  };
  campaignSeed: {
    title?: string;
    goalAmount?: number;
    timeframe?: string;
    useOfFunds?: string;
    suggestedDonationImpacts: Array<{
      amount: number;
      impact: string;
    }>;
  };
  storeSeed: {
    hasProducts: boolean;
    products: Array<{
      name: string;
      description?: string;
      price?: number;
      type: ProductType;
    }>;
  };
  streetFundraisingGuideSeed: {
    currentPitch?: string;
    commonObjections: string[];
    forbiddenClaims: string[];
    preferredTone: string;
    faq: Array<{
      question: string;
      answer?: string;
    }>;
  };
  operations: {
    ownerRole?: string;
    weeklyTimeAvailable?: string;
    digitalMaturity: DigitalMaturity;
    sensitiveDataNotes?: string;
  };
  metadata: {
    onboardingStatus: OnboardingStatus;
    completedAt?: string;
    source: OnboardingSource;
    confidence: Confidence;
    missingFields: string[];
  };
};

/** A single attachment uploaded inside a chat message. */
export type ChatAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url?: string;
  extractedText?: string;
  createdAt: string;
};

export type ChatRole = 'assistant' | 'user' | 'system';

export type OnboardingMessage = {
  id: string;
  role: ChatRole;
  content: string;
  attachments?: ChatAttachment[];
  createdAt: string;
  /** Which onboarding question this assistant message was asking, if any. */
  questionKey?: string | null;
};

/**
 * Server-side session record. Persisted in the onboarding store
 * (Redis when configured, in-memory fallback otherwise).
 */
export type OnboardingSession = {
  id: string;
  subdomain?: string;
  createdAt: string;
  updatedAt: string;
  source: OnboardingSource;
  status: OnboardingStatus;
  /** Ordered conversation transcript. */
  messages: OnboardingMessage[];
  /** Profile built up incrementally as answers come in. */
  profile: NgoOnboardingProfile;
  /** The question the agent is currently waiting an answer for. */
  currentQuestionKey: string | null;
  /** Raw answers keyed by question key (audit trail + voice-tool writes). */
  answers: Record<string, { answer: string; confidence: Confidence; at: string }>;
  /** Onboarding block keys the agent considers covered. */
  completedBlocks: string[];
};

/**
 * Structured response contract the text agent must return on each turn.
 * Mirrors the JSON the LLM is prompted to produce.
 */
export type AgentTurnResult = {
  assistantMessage: string;
  nextQuestionKey: string | null;
  profilePatch: DeepPartial<NgoOnboardingProfile>;
  completedBlocks: string[];
  missingFields: string[];
  shouldComplete: boolean;
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<U>
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};
