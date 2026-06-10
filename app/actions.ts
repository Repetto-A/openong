'use server';

import { redis } from '@/lib/redis';
import { resolveOrgAccess, isSuperadmin } from '@/lib/org-context';
import { deleteOrg } from '@/lib/orgs';
import {
  addCampaign,
  getCampaigns,
  slugify,
  updateCampaign,
  type CampaignType,
  type CampaignPayment
} from '@/lib/campaigns';
import { buildDemoCampaignPrompt } from '@/lib/demo-campaign-prompt';
import {
  getOrgProfile,
  getOrgRecommendations,
  deleteOrgOnboardingData
} from '@/lib/onboarding/org-store';
import { buildCampaignPromptFromProfile } from '@/lib/onboarding/recommendations';
import {
  getOrders,
  updateOrderStatus,
  paidOrderStatus,
  type OrderStatus
} from '@/lib/orders';
import { revalidatePath } from 'next/cache';

export async function deleteOrganizationAction(
  prevState: any,
  formData: FormData
) {
  if (!(await isSuperadmin())) {
    return { error: 'No autorizado' };
  }

  const orgId = formData.get('orgId') as string;
  if (!orgId) {
    return { error: 'Missing organization id' };
  }

  await deleteOrg(orgId);

  await Promise.all([
    redis.del(`org:${orgId}:campaigns`),
    redis.del(`org:${orgId}:orders`),
    redis.del(`org:${orgId}:traffic:views`),
    deleteOrgOnboardingData(orgId)
  ]);
  const extra = [
    ...(await redis.keys(`org:${orgId}:page:*`)),
    ...(await redis.keys(`org:${orgId}:traffic:uniq:*`))
  ];
  if (extra.length) {
    await redis.del(...extra);
  }

  revalidatePath('/superadmin');
  return { success: 'Organization deleted successfully' };
}

type CreateCampaignState = {
  error?: string;
  slug?: string;
};

export async function createCampaignAction(
  subdomain: string,
  data: {
    title: string;
    type: CampaignType;
    slug: string;
    prompt: string;
    images?: string[];
    payment?: CampaignPayment;
    recommendationId?: string;
  }
): Promise<CreateCampaignState> {
  const result = await resolveOrgAccess(subdomain);
  if (!result.ok) {
    return { error: 'No autorizado' };
  }
  if (!result.access.canCreateCampaign) {
    return { error: 'No autorizado para crear campañas' };
  }

  const orgId = result.access.orgId;
  let title = data.title?.trim();
  let type = data.type;
  let prompt = buildDemoCampaignPrompt({
    type,
    title: title ?? '',
    userPrompt: data.prompt
  });

  if (data.recommendationId) {
    const [profile, recommendations] = await Promise.all([
      getOrgProfile(orgId),
      getOrgRecommendations(orgId)
    ]);

    const recommendation = recommendations.find(
      (item) => item.id === data.recommendationId
    );

    if (!profile || !recommendation) {
      return { error: 'No pudimos cargar la sugerencia elegida.' };
    }

    title = recommendation.title;
    type = recommendation.type;
    prompt = buildCampaignPromptFromProfile({ profile, recommendation });
  }

  if (!title) {
    return { error: 'Title is required' };
  }

  let slug = slugify(data.slug || title);
  if (!slug) {
    return { error: 'Could not generate a valid slug from the title' };
  }

  const campaigns = await getCampaigns(orgId);
  if (campaigns.some((c) => c.slug === slug)) {
    let i = 2;
    while (campaigns.some((c) => c.slug === `${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }

  await addCampaign(orgId, {
    slug,
    title,
    type,
    prompt,
    images: data.images?.filter(Boolean) ?? [],
    payment: data.payment,
    status: 'pending',
    createdAt: Date.now()
  });

  revalidatePath('/admin');
  revalidatePath(`/s/${result.access.slug}`);

  return { slug };
}

export async function markCampaignSentAction(
  subdomain: string,
  slug: string
): Promise<void> {
  const result = await resolveOrgAccess(subdomain);
  if (!result.ok) return;
  await updateCampaign(result.access.orgId, slug, { status: 'sent' });
}

export async function updateOrderStatusAction(
  subdomain: string,
  orderId: string,
  status: OrderStatus
): Promise<void> {
  const result = await resolveOrgAccess(subdomain);
  if (!result.ok) return;
  await updateOrderStatus(result.access.orgId, orderId, status);
  revalidatePath(`/s/${result.access.slug}`);
}

export async function approveOrderAction(
  subdomain: string,
  orderId: string
): Promise<void> {
  const result = await resolveOrgAccess(subdomain);
  if (!result.ok) return;
  const orgId = result.access.orgId;
  const order = (await getOrders(orgId)).find((o) => o.id === orderId);
  if (!order) return;
  await updateOrderStatus(orgId, orderId, paidOrderStatus(order.campaignType));
  revalidatePath(`/s/${result.access.slug}`);
}
