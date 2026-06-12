/**
 * Onboarding question script.
 *
 * The conversation is organized in blocks. Each question has a stable
 * `key` (used by `save_onboarding_answer` and the live summary), the
 * conversational prompt, and an optional follow-up nudge used when the
 * deterministic engine detects a vague/empty answer.
 *
 * The keys here are the single source of truth shared by:
 *  - the text agent (deterministic + LLM modes)
 *  - the ElevenLabs voice tools (`question_key` argument)
 *  - the live profile summary mapping (lib/onboarding/profile.ts)
 */

export type OnboardingBlockKey =
  | 'identity'
  | 'impact'
  | 'fundraising'
  | 'channels'
  | 'campaign'
  | 'store'
  | 'street'
  | 'operations';

export type OnboardingQuestion = {
  key: string;
  block: OnboardingBlockKey;
  /** Conversational prompt shown to the NGO. */
  prompt: string;
  /** Shorter label used in the live summary / progress UI. */
  label: string;
  /** Whether this question must be answered before completion is allowed. */
  required?: boolean;
  /** Nudge used when an answer is too vague. */
  reAsk?: string;
};

export type OnboardingBlock = {
  key: OnboardingBlockKey;
  title: string;
};

export const ONBOARDING_BLOCKS: OnboardingBlock[] = [
  { key: 'identity', title: 'Identidad' },
  { key: 'impact', title: 'Programas e impacto' },
  { key: 'fundraising', title: 'Recaudación actual' },
  { key: 'channels', title: 'Comunidad y canales' },
  { key: 'campaign', title: 'Campañas' },
  { key: 'store', title: 'Tienda solidaria' },
  { key: 'street', title: 'Captación en calle' },
  { key: 'operations', title: 'Operatoria' }
];

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  // 1. Identidad
  {
    key: 'org_name',
    block: 'identity',
    label: 'Nombre de la ONG',
    prompt: 'Para arrancar, ¿cómo se llama tu organización?',
    required: true,
    reAsk: '¿Me decís el nombre tal cual lo usan, así lo registro bien?'
  },
  {
    key: 'org_one_liner',
    block: 'identity',
    label: 'En una frase',
    prompt: 'En una sola frase, ¿qué hacen?',
    required: true,
    reAsk: 'Contame en una frase corta lo que hacen, como se lo dirías a alguien en la calle.'
  },
  {
    key: 'org_cause',
    block: 'identity',
    label: 'Causa',
    prompt: '¿Qué causa o problemática trabajan?',
    required: true
  },
  {
    key: 'org_beneficiaries',
    block: 'identity',
    label: 'Beneficiarios',
    prompt: '¿A quiénes ayudan? ¿Quiénes son los beneficiarios?',
    required: true
  },
  {
    key: 'org_location',
    block: 'identity',
    label: 'Zona',
    prompt: '¿En qué zona o región operan?'
  },

  // 2. Programas e impacto
  {
    key: 'programs',
    block: 'impact',
    label: 'Programas',
    prompt: '¿Cuáles son sus programas o actividades principales?',
    required: true
  },
  {
    key: 'impact_metrics',
    block: 'impact',
    label: 'Métricas',
    prompt:
      '¿Tienen números concretos? Por ejemplo: personas ayudadas, kits entregados, talleres, alimentos distribuidos, becas. Si no los tenés a mano, no hay drama.'
  },
  {
    key: 'impact_stories',
    block: 'impact',
    label: 'Historias',
    prompt: '¿Tienen alguna historia, testimonio o caso representativo que los enorgullezca?'
  },

  // 3. Recaudación actual
  {
    key: 'fundraising_methods',
    block: 'fundraising',
    label: 'Cómo recaudan',
    prompt: '¿Cómo recaudan fondos hoy?',
    required: true
  },
  {
    key: 'donor_types',
    block: 'fundraising',
    label: 'Tipos de donante',
    prompt:
      '¿De dónde viene la plata? ¿Donantes individuales, empresas, grants, eventos? ¿Tienen donantes recurrentes?'
  },
  {
    key: 'payment_methods',
    block: 'fundraising',
    label: 'Medios de pago',
    prompt: '¿Cómo reciben las donaciones? ¿Mercado Pago, transferencia, efectivo, débito automático?'
  },
  {
    key: 'fundraising_challenge',
    block: 'fundraising',
    label: 'Mayor problema',
    prompt: '¿Cuál es hoy el mayor problema de recaudación que tienen?',
    required: true
  },

  // 4. Comunidad y canales
  {
    key: 'channels',
    block: 'channels',
    label: 'Canales',
    prompt:
      '¿Qué canales tienen activos? Instagram, WhatsApp, email, web, base de datos, voluntarios, eventos.',
    required: true
  },
  {
    key: 'best_channel',
    block: 'channels',
    label: 'Mejor canal',
    prompt: '¿Cuál de esos canales les funciona mejor para conectar con la gente?'
  },
  {
    key: 'audience_not_donating',
    block: 'channels',
    label: 'Seguidores que no donan',
    prompt: '¿Tienen seguidores o gente que los sigue pero todavía no dona?'
  },

  // 5. Campañas
  {
    key: 'campaign_need',
    block: 'campaign',
    label: 'Necesidad urgente',
    prompt: '¿Tienen una campaña urgente o una necesidad concreta para recaudar ahora?'
  },
  {
    key: 'campaign_goal',
    block: 'campaign',
    label: 'Cuánto necesitan',
    prompt: '¿Cuánto necesitan recaudar y en cuánto tiempo?'
  },
  {
    key: 'campaign_use_of_funds',
    block: 'campaign',
    label: 'Uso de fondos',
    prompt: '¿Qué se logra concretamente con esa plata? ¿Qué cambia para los beneficiarios?'
  },

  // 6. Tienda solidaria
  {
    key: 'store_products',
    block: 'store',
    label: 'Productos',
    prompt: '¿Venden algún producto o tienen merchandising hoy? ¿Algo hecho por los beneficiarios?'
  },
  {
    key: 'store_symbolic',
    block: 'store',
    label: 'Donaciones simbólicas',
    prompt:
      '¿Les interesaría ofrecer donaciones simbólicas como productos? Por ejemplo: "un plato de comida", "un kit escolar", "una beca".'
  },

  // 7. Captación en calle
  {
    key: 'street_team',
    block: 'street',
    label: 'Captación en calle',
    prompt: '¿Tienen personas captando donaciones en la calle o en eventos?'
  },
  {
    key: 'street_pitch',
    block: 'street',
    label: 'Qué dicen',
    prompt: '¿Qué suelen decir para presentar la causa?'
  },
  {
    key: 'street_objections',
    block: 'street',
    label: 'Objeciones',
    prompt: '¿Qué objeciones o preguntas frecuentes les aparecen?'
  },
  {
    key: 'street_forbidden',
    block: 'street',
    label: 'Qué no decir',
    prompt: '¿Hay cosas que NO quieren que se digan al comunicar?'
  },
  {
    key: 'preferred_tone',
    block: 'street',
    label: 'Tono',
    prompt:
      '¿Qué tono prefieren para comunicar? Cercano, institucional, emocional, urgente o esperanzador.',
    required: true
  },

  // 8. Operatoria
  {
    key: 'ops_owner',
    block: 'operations',
    label: 'Responsable',
    prompt: '¿Quién se encargaría de usar esta herramienta en el día a día?'
  },
  {
    key: 'ops_time',
    block: 'operations',
    label: 'Tiempo disponible',
    prompt: '¿Cuánto tiempo real por semana tienen para esto?'
  },
  {
    key: 'ops_digital_maturity',
    block: 'operations',
    label: 'Madurez digital',
    prompt: '¿Qué tan cómodo está el equipo usando herramientas digitales?'
  },
  {
    key: 'ops_sensitive',
    block: 'operations',
    label: 'Datos sensibles',
    prompt:
      '¿Manejan datos sensibles o hay algo que prefieran NO automatizar? Contámelo en general, sin detalles privados.'
  }
];

export const QUESTION_BY_KEY: Record<string, OnboardingQuestion> = Object.fromEntries(
  ONBOARDING_QUESTIONS.map((q) => [q.key, q])
);

/** Questions that gate completion. */
export const REQUIRED_QUESTION_KEYS = ONBOARDING_QUESTIONS.filter(
  (q) => q.required
).map((q) => q.key);

/** Minimum blocks that must be touched before `mark_complete` is allowed. */
export const MIN_BLOCKS_FOR_COMPLETION: OnboardingBlockKey[] = [
  'identity',
  'impact',
  'fundraising',
  'channels'
];

export function getFirstQuestionKey(): string {
  return ONBOARDING_QUESTIONS[0].key;
}

/**
 * Next unanswered question.
 *
 * Required questions are always surfaced first (in script order) so the user
 * covers the minimum for campaign generation before any optional questions.
 * Once all required questions are answered, the function resumes sequential
 * optional flow starting from afterKey.
 */
export function getNextQuestionKey(
  answeredKeys: Set<string>,
  afterKey?: string | null
): string | null {
  // Required questions take priority — surface all before optional ones.
  const nextRequired = ONBOARDING_QUESTIONS.find(
    (q) => q.required && !answeredKeys.has(q.key)
  );
  if (nextRequired) return nextRequired.key;

  // All required answered — continue with optional questions in script order.
  const startIndex = afterKey
    ? ONBOARDING_QUESTIONS.findIndex((q) => q.key === afterKey) + 1
    : 0;
  for (let i = Math.max(startIndex, 0); i < ONBOARDING_QUESTIONS.length; i++) {
    if (!answeredKeys.has(ONBOARDING_QUESTIONS[i].key)) {
      return ONBOARDING_QUESTIONS[i].key;
    }
  }
  // Wrap around to any earlier unanswered optional question.
  for (const q of ONBOARDING_QUESTIONS) {
    if (!answeredKeys.has(q.key)) return q.key;
  }
  return null;
}
