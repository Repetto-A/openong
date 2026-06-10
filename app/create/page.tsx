import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import { logDevAuthDebug } from '@/lib/auth-debug';
import { OrgChooser } from './org-chooser';

export const metadata: Metadata = {
  title: 'Tu organización · OpenONG',
  description:
    'Elegí tu organización o creá una nueva en OpenONG y empezá a montar tus canales de financiación con IA.'
};

export default async function CreatePage() {
  const { userId, orgSlug } = await auth();
  const requestHeaders = await headers();

  logDevAuthDebug({
    pathname: '/create',
    host: requestHeaders.get('host'),
    userId,
    orgSlug,
    reason: userId ? 'create:authenticated' : 'create:missing-user'
  });

  if (!userId) {
    redirect('/sign-in?redirect_url=%2Fcreate');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <OrgChooser />
    </div>
  );
}
