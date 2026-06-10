import { getOrgBySlug, markOrgOnboarded } from '@/lib/orgs';
import { saveOrgProfile, saveOrgRecommendations } from './org-store';
import { buildCampaignRecommendations } from './recommendations';
import { refreshDerivedMetadata } from './profile';
import { saveSession } from './store';
import type {
  CampaignRecommendation,
  OnboardingSession
} from './types';

type FinalizeOptions = {
  orgId?: string;
  orgSlug?: string;
};

export async function finalizeOnboardingSession(
  session: OnboardingSession,
  options: FinalizeOptions = {}
): Promise<CampaignRecommendation[]> {
  refreshDerivedMetadata(session);
  session.status = 'completed';
  session.profile.metadata.onboardingStatus = 'completed';
  session.profile.metadata.completedAt = new Date().toISOString();
  session.currentQuestionKey = null;

  const orgSlug = options.orgSlug ?? session.subdomain;
  const org = options.orgId
    ? null
    : orgSlug
      ? await getOrgBySlug(orgSlug)
      : null;
  const orgId = options.orgId ?? org?.id;
  const recommendations = orgId
    ? buildCampaignRecommendations(session.profile)
    : [];

  const writes: Promise<unknown>[] = [saveSession(session)];

  if (orgId) {
    writes.push(saveOrgProfile(orgId, session.profile));
    writes.push(saveOrgRecommendations(orgId, recommendations));
  }

  if (orgSlug) {
    writes.push(markOrgOnboarded(orgSlug));
  }

  await Promise.all(writes);

  return recommendations;
}
