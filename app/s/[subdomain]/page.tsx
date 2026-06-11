import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getOrgBySlug } from '@/lib/orgs';
import { getCampaigns } from '@/lib/campaigns';
import { HeartHandshake, ShoppingBag, PackageCheck, ArrowRight } from 'lucide-react';

export async function generateMetadata({
  params
}: {
  params: Promise<{ subdomain: string }>;
}): Promise<Metadata> {
  const { subdomain } = await params;
  const org = await getOrgBySlug(subdomain);
  return {
    title: org ? org.name : subdomain,
    description: org
      ? `Conocé las iniciativas de ${org.name} y sumate a la causa.`
      : undefined
  };
}

export const dynamic = 'force-dynamic';

const TYPE_META = {
  crowdfunding: { label: 'Campaña', icon: HeartHandshake, cta: 'Quiero aportar' },
  tienda: { label: 'Tienda solidaria', icon: ShoppingBag, cta: 'Ver tienda' },
  object_collection: {
    label: 'Colecta',
    icon: PackageCheck,
    cta: 'Quiero colaborar'
  }
} as const;

export default async function OngPublicPage({
  params
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const org = await getOrgBySlug(subdomain);

  if (!org) {
    notFound();
  }

  const campaigns = await getCampaigns(org.id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <main className="mx-auto max-w-2xl px-4 py-16 md:py-24">
        <header className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
            {org.name}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg text-gray-600">
            Conocé nuestras iniciativas y sumate a la causa.
          </p>
        </header>

        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            Conocé nuestras iniciativas
          </h2>

          {campaigns.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-gray-200 bg-white/60 px-4 py-12 text-center text-gray-500">
              Todavía no hay iniciativas publicadas. Volvé pronto.
            </p>
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              {campaigns.map((campaign) => {
                const meta = TYPE_META[campaign.type] ?? TYPE_META.crowdfunding;
                const Icon = meta.icon;
                return (
                  <Link
                    key={campaign.slug}
                    href={`/${campaign.slug}`}
                    className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-lg font-semibold text-gray-900">
                        {campaign.title || 'Iniciativa'}
                      </h3>
                      <p className="text-sm text-gray-500">{meta.label}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600">
                      <span className="hidden sm:inline">{meta.cta}</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
