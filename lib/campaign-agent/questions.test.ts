import { describe, expect, it } from 'vitest';
import { CAMPAIGN_QUESTIONS, computeDraftProgress, parseAffirmation, safetyFromAnswers } from './questions';
import type { CampaignDraft } from './types';

const at = () => new Date().toISOString();
const PUBLIC_PRIVATE_BLOCKER = 'Falta confirmar qué queda público y qué queda privado.';

describe('campaign agent domain', () => {
  it('keeps stable required question keys for the operational MVP', () => {
    expect(CAMPAIGN_QUESTIONS.map((q) => q.key)).toContain('campaign.goal');
    expect(CAMPAIGN_QUESTIONS.map((q) => q.key)).toContain('beneficiaries.has_minors');
    expect(CAMPAIGN_QUESTIONS.map((q) => q.key)).toContain('page.public_private_review');
    expect(CAMPAIGN_QUESTIONS.filter((q) => q.required).length).toBeGreaterThan(8);
  });

  it('computes missing required question keys from draft answers', () => {
    const draft = { answers: { 'campaign.goal': { answer: 'Abrigo', confidence: 'medium', at: new Date().toISOString() } } } as Pick<CampaignDraft, 'answers'>;
    const progress = computeDraftProgress(draft);
    expect(progress.answered).toBe(1);
    expect(progress.missingQuestionKeys).not.toContain('campaign.goal');
    expect(progress.missingQuestionKeys).toContain('beneficiaries.groups');
  });

  it('treats minors and missing photo permissions as private safety warnings', () => {
    const safety = safetyFromAnswers({
      'beneficiaries.has_minors': { answer: 'Sí, hay niñas y niños', confidence: 'high', at: new Date().toISOString() },
      'beneficiaries.photo_permissions': { answer: 'No tenemos autorizaciones', confidence: 'high', at: new Date().toISOString() }
    });
    expect(safety.hasMinors).toBe(true);
    expect(safety.hasPhotoPermissions).toBe(false);
    expect(safety.warnings.join(' ')).toMatch(/menores/i);
    expect(safety.blockers).toContain(PUBLIC_PRIVATE_BLOCKER);
  });

  it('keeps the public/private blocker when the review answer is negated', () => {
    // Regression: a regex matching "confirm" inside "no confirmo" used to flip
    // the review to reviewed=true and let a draft publish without sign-off.
    const safety = safetyFromAnswers({
      'page.public_private_review': { answer: 'No confirmo todavía', confidence: 'high', at: at() }
    });
    expect(safety.publicPrivateReviewed).toBe(false);
    expect(safety.blockers).toContain(PUBLIC_PRIVATE_BLOCKER);
  });

  it('lifts the public/private blocker only on an explicit confirmation', () => {
    const safety = safetyFromAnswers({
      'page.public_private_review': { answer: 'Sí, confirmo que solo mostramos datos agregados', confidence: 'high', at: at() }
    });
    expect(safety.publicPrivateReviewed).toBe(true);
    expect(safety.blockers).not.toContain(PUBLIC_PRIVATE_BLOCKER);
  });

  it('treats a negated minors answer as no minors, not a false positive', () => {
    const safety = safetyFromAnswers({
      'beneficiaries.has_minors': { answer: 'No, no hay menores', confidence: 'high', at: at() }
    });
    expect(safety.hasMinors).toBe(false);
  });

  it('classifies affirmations, negations and ambiguity', () => {
    expect(parseAffirmation('Sí, dale')).toBe('yes');
    expect(parseAffirmation('no confirmo')).toBe('no');
    expect(parseAffirmation('sin permisos')).toBe('no');
    expect(parseAffirmation('quizás más adelante')).toBe('unknown');
    expect(parseAffirmation('')).toBe('unknown');
  });
});
