import type { CampaignDraft, CampaignDraftStructured, SafetyReview } from './types';

export type CampaignQuestion = {
  key: string;
  label: string;
  prompt: string;
  required?: boolean;
  block: 'campaign' | 'beneficiaries' | 'logistics' | 'collaborators' | 'communications' | 'safety' | 'page';
};

export const CAMPAIGN_QUESTIONS: CampaignQuestion[] = [
  { key: 'campaign.goal', block: 'campaign', label: 'Qué se colecta', prompt: '¿Qué necesitan colectar concretamente? Por ejemplo: mochilas, abrigo, juguetes o alimentos.', required: true },
  { key: 'campaign.name', block: 'campaign', label: 'Nombre', prompt: '¿Ya tienen nombre para la campaña? Si no, te propongo uno simple.', required: true },
  { key: 'campaign.deadline', block: 'campaign', label: 'Fecha límite', prompt: '¿Hasta qué fecha reciben donaciones?', required: true },
  { key: 'campaign.delivery_date', block: 'campaign', label: 'Entrega', prompt: '¿Cuándo planean entregar lo recolectado?' },
  { key: 'campaign.delivery_location', block: 'campaign', label: 'Lugar de entrega', prompt: '¿Dónde se entrega o distribuye lo recolectado?' },
  { key: 'beneficiaries.groups', block: 'beneficiaries', label: 'Beneficiarios', prompt: '¿Para qué grupo de beneficiarios es la colecta y cuántos estiman?', required: true },
  { key: 'beneficiaries.fields_available', block: 'beneficiaries', label: 'Datos disponibles', prompt: '¿Qué datos tienen de cada beneficiario? No me pases datos sensibles todavía: solo tipos de dato, como edad, talle, zona o necesidad.' },
  { key: 'beneficiaries.privacy_level', block: 'beneficiaries', label: 'Privacidad', prompt: '¿Esos datos pueden mostrarse públicamente o deben quedar privados?', required: true },
  { key: 'beneficiaries.has_minors', block: 'safety', label: 'Menores', prompt: '¿Hay menores involucrados?', required: true },
  { key: 'beneficiaries.photo_permissions', block: 'safety', label: 'Permisos de fotos', prompt: '¿Tienen permisos para mostrar fotos o historias personales? Si no, lo dejamos privado.', required: true },
  { key: 'logistics.reception_points', block: 'logistics', label: 'Puntos de recepción', prompt: '¿Dónde van a recibir las donaciones? Decime nombre del lugar, dirección y horarios.', required: true },
  { key: 'logistics.responsibles', block: 'logistics', label: 'Responsables', prompt: '¿Quién será responsable de cada punto de recepción?' },
  { key: 'logistics.receipt_confirmation_mode', block: 'logistics', label: 'Confirmación', prompt: '¿Cómo van a confirmar que una donación fue recibida?', required: true },
  { key: 'collaborators.signup_mode', block: 'collaborators', label: 'Inscripción', prompt: '¿Cómo querés que se anoten los colaboradores: formulario, WhatsApp o carga manual?', required: true },
  { key: 'collaborators.assignment_preference', block: 'collaborators', label: 'Asignación', prompt: '¿Preferís asignar beneficiarios automáticamente o revisar manualmente?' },
  { key: 'communications.channels', block: 'communications', label: 'Canales', prompt: '¿Qué canales van a usar para avisar y recordar: WhatsApp, Instagram, email, Facebook?', required: true },
  { key: 'communications.reminders', block: 'communications', label: 'Recordatorios', prompt: '¿Querés que prepare mensajes de recordatorio para quienes se comprometan a donar?', required: true },
  { key: 'page.public_private_review', block: 'page', label: 'Público vs privado', prompt: 'Antes de publicar: ¿confirmás que solo mostremos información agregada y dejemos privados los datos personales?', required: true }
];

export const CAMPAIGN_QUESTION_BY_KEY = Object.fromEntries(
  CAMPAIGN_QUESTIONS.map((q) => [q.key, q])
) as Record<string, CampaignQuestion>;

export function getFirstCampaignQuestionKey() {
  return CAMPAIGN_QUESTIONS[0].key;
}

export function getNextCampaignQuestionKey(answeredKeys: Set<string>, afterKey?: string | null) {
  const start = afterKey ? CAMPAIGN_QUESTIONS.findIndex((q) => q.key === afterKey) + 1 : 0;
  for (let i = Math.max(0, start); i < CAMPAIGN_QUESTIONS.length; i++) {
    if (!answeredKeys.has(CAMPAIGN_QUESTIONS[i].key)) return CAMPAIGN_QUESTIONS[i].key;
  }
  return null;
}

export function computeDraftProgress(draft: Pick<CampaignDraft, 'answers'>) {
  const answered = new Set(Object.keys(draft.answers));
  const missingQuestionKeys = CAMPAIGN_QUESTIONS.filter((q) => q.required && !answered.has(q.key)).map((q) => q.key);
  return { answered: answered.size, total: CAMPAIGN_QUESTIONS.length, missingQuestionKeys };
}

export function patchStructuredFromAnswer(questionKey: string, answer: string): Partial<CampaignDraftStructured> {
  const text = answer.trim();
  const amount = text.match(/\b(\d{1,5})\b/);
  switch (questionKey) {
    case 'campaign.goal':
      return { collectedItems: text, publicSummary: `Estamos organizando una colecta de ${text}.` };
    case 'campaign.name':
      return { title: text };
    case 'campaign.deadline':
      return { deadline: text };
    case 'campaign.delivery_date':
      return { deliveryDate: text };
    case 'campaign.delivery_location':
      return { deliveryLocation: text };
    case 'beneficiaries.groups':
      return { beneficiarySummary: text, targetCount: amount ? Number(amount[1]) : undefined };
    case 'logistics.receipt_confirmation_mode':
      return { receiptConfirmationMode: text };
    case 'collaborators.signup_mode':
      return { signupMode: text };
    case 'page.public_private_review':
      return { privacyNotes: text };
    default:
      return {};
  }
}

/**
 * Classify a free-text answer as an explicit yes, an explicit no, or unknown.
 *
 * Safety gates must never be unlocked by a negated phrase. A previous regex
 * matched "confirm" inside "no confirmo todavía", flipping the public/private
 * review to "reviewed" and letting a draft publish. Here explicit negation
 * always wins, so any answer containing a standalone "no" stays fail-closed.
 */
export function parseAffirmation(text: string): 'yes' | 'no' | 'unknown' {
  const t = text.trim().toLowerCase();
  if (!t) return 'unknown';
  // Negation takes precedence so safety gates stay fail-closed on ambiguity.
  if (/(^|\s)(no|nop|negativo|tampoco|sin|nunca|todav[ií]a no|a[uú]n no)(\s|,|\.|;|$)/.test(t)) {
    return 'no';
  }
  if (/(^|\s)(s[ií]|sip|claro|dale|obvio|correcto|confirm|afirmativo|tenemos|ten[eé]s|autoriz|hay|listo|por supuesto)/.test(t)) {
    return 'yes';
  }
  return 'unknown';
}

export function safetyFromAnswers(answers: CampaignDraft['answers']): SafetyReview {
  const minorsAnswer = answers['beneficiaries.has_minors']?.answer;
  const photoAnswer = answers['beneficiaries.photo_permissions']?.answer;
  const reviewAnswer = answers['page.public_private_review']?.answer;

  // Minors: assume the riskier case (minors present) on anything but an
  // explicit "no". Unanswered means "not asked yet", so don't warn early.
  const hasMinors = minorsAnswer ? parseAffirmation(minorsAnswer) !== 'no' : false;
  // Photo permissions and public/private review: require an explicit "yes".
  const hasPhotoPermissions = photoAnswer ? parseAffirmation(photoAnswer) === 'yes' : false;
  const reviewed = reviewAnswer ? parseAffirmation(reviewAnswer) === 'yes' : false;

  const warnings: string[] = [];
  const blockers: string[] = [];

  if (hasMinors) warnings.push('Hay menores involucrados: los datos personales deben quedar privados.');
  if (hasMinors && !hasPhotoPermissions) warnings.push('No hay permisos de fotos confirmados: no publicar imágenes ni historias personales.');
  if (!reviewed) blockers.push('Falta confirmar qué queda público y qué queda privado.');

  return {
    hasSensitiveData: hasMinors,
    hasMinors,
    hasPhotoPermissions,
    publicPrivateReviewed: reviewed,
    warnings,
    blockers
  };
}
