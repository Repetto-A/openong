import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { requireActiveOrg } from '@/lib/org-context';
import { getOrgBySlug } from '@/lib/orgs';
import { rootDomain } from '@/lib/utils';
import { OnboardingExperience } from '@/components/onboarding/onboarding-experience';
import { AdminHeader } from '@/app/admin-header';
import { getVoiceAvailability } from '@/lib/onboarding/voice-config';

export async function generateMetadata(): Promise<Metadata> {
  const { orgSlug } = await auth();
  const org = orgSlug ? await getOrgBySlug(orgSlug) : null;
  return { title: org ? `${org.name} · Onboarding` : rootDomain };
}

export const dynamic = 'force-dynamic';

export default async function OngOnboardingPage() {
  const access = await requireActiveOrg();

  if (access.onboardingCompletedAt) {
    redirect('/admin');
  }

  const voice = getVoiceAvailability();

  return (
    <main className="min-h-screen bg-[#f6f1e8] px-4 py-6 text-slate-950">
      <div className="mx-auto mb-4 w-full max-w-7xl">
        <AdminHeader superadmin={access.superadmin} />
      </div>
      <OnboardingExperience
        voiceEnabled={voice.enabled}
        voiceAgentId={voice.agentId}
        voiceDisabledReason={voice.reason}
        subdomain={access.slug}
        adminHref="/admin"
      />
    </main>
  );
}
