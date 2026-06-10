import { redis } from '@/lib/redis';
import type {
  CampaignRecommendation,
  NgoOnboardingProfile
} from './types';

function profileKey(orgId: string) {
  return `org:${orgId}:onboarding:profile`;
}

function recommendationsKey(orgId: string) {
  return `org:${orgId}:onboarding:recommendations`;
}

export async function getOrgProfile(
  orgId: string
): Promise<NgoOnboardingProfile | null> {
  return (await redis.get<NgoOnboardingProfile>(profileKey(orgId))) ?? null;
}

export async function saveOrgProfile(
  orgId: string,
  profile: NgoOnboardingProfile
): Promise<void> {
  await redis.set(profileKey(orgId), profile);
}

export async function getOrgRecommendations(
  orgId: string
): Promise<CampaignRecommendation[]> {
  return (
    (await redis.get<CampaignRecommendation[]>(recommendationsKey(orgId))) ?? []
  );
}

export async function saveOrgRecommendations(
  orgId: string,
  recommendations: CampaignRecommendation[]
): Promise<void> {
  await redis.set(recommendationsKey(orgId), recommendations);
}

export async function deleteOrgOnboardingData(orgId: string): Promise<void> {
  await redis.del(profileKey(orgId));
  await redis.del(recommendationsKey(orgId));
}
