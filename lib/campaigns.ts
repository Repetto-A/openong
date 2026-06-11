import { redis } from '@/lib/redis';

export type CampaignType = 'crowdfunding' | 'tienda' | 'object_collection';

export type CampaignStatus = 'pending' | 'sent';

export type PaymentMethod = 'mercadopago' | 'cbu';

/** How buyers pay for products on a campaign's public site. */
export type CampaignPayment = {
  method: PaymentMethod;
  /** MercadoPago payment link (when method === 'mercadopago'). */
  link?: string;
  /** Bank CBU/alias buyers transfer to (when method === 'cbu'). */
  cbu?: string;
};

export type Campaign = {
  slug: string;
  title: string;
  type: CampaignType;
  prompt: string;
  status: CampaignStatus;
  /** Cloudinary URLs of images uploaded when the campaign was created. */
  images?: string[];
  /** Payment configuration for checkout. */
  payment?: CampaignPayment;
  createdAt: number;
};

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function campaignsKey(orgId: string) {
  return `org:${orgId}:campaigns`;
}

export async function getCampaigns(orgId: string): Promise<Campaign[]> {
  const data = await redis.get<Campaign[]>(campaignsKey(orgId));
  return data || [];
}

export async function getCampaign(
  orgId: string,
  slug: string
): Promise<Campaign | null> {
  const campaigns = await getCampaigns(orgId);
  return campaigns.find((c) => c.slug === slug) || null;
}

export async function addCampaign(
  orgId: string,
  campaign: Campaign
): Promise<void> {
  const campaigns = await getCampaigns(orgId);
  campaigns.push(campaign);
  await redis.set(campaignsKey(orgId), campaigns);
}

export async function updateCampaign(
  orgId: string,
  slug: string,
  patch: Partial<Campaign>
): Promise<void> {
  const campaigns = await getCampaigns(orgId);
  const next = campaigns.map((c) =>
    c.slug === slug ? { ...c, ...patch } : c
  );
  await redis.set(campaignsKey(orgId), next);
}
