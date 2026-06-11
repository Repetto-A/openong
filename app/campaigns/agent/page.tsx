import { redirect } from 'next/navigation';
import { requireActiveOrg } from '@/lib/org-context';
import { CampaignAgentWorkspace } from '@/components/campaign-agent/campaign-agent-workspace';

export const dynamic = 'force-dynamic';

export default async function CampaignAgentPage() {
  const access = await requireActiveOrg();
  if (!access.onboardingCompletedAt) redirect('/onboarding');
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <CampaignAgentWorkspace />
      </div>
    </main>
  );
}
