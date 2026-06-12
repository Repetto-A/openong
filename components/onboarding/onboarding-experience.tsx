'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Circle,
  HeartHandshake,
  Loader2,
  RotateCcw,
  Save,
  ShoppingBag,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ONBOARDING_BLOCKS, REQUIRED_QUESTION_KEYS } from '@/lib/onboarding/questions';
import { cn } from '@/lib/utils';
import { useOnboarding } from './use-onboarding';
import { ChatPanel } from './chat-panel';
import { ChatInput } from './chat-input';
import { VoicePanel } from './voice-panel';
import type {
  CampaignRecommendation,
  OnboardingSession
} from '@/lib/onboarding/types';
import type { VoiceAvailabilityReason } from '@/lib/onboarding/voice-config';

const TOTAL_BLOCKS = ONBOARDING_BLOCKS.length;
const TOTAL_REQUIRED = REQUIRED_QUESTION_KEYS.length;

export function OnboardingExperience({
  voiceEnabled,
  voiceAgentId,
  voiceDisabledReason,
  subdomain,
  adminHref
}: {
  voiceEnabled: boolean;
  voiceAgentId?: string;
  voiceDisabledReason: VoiceAvailabilityReason;
  subdomain?: string;
  adminHref: string;
}) {
  const {
    session,
    recommendations,
    status,
    saveState,
    lastSavedAt,
    sending,
    error,
    sendMessage,
    uploadFile,
    complete,
    reset
  } = useOnboarding(subdomain);

  const completedBlockCount = session?.completedBlocks.length ?? 0;
  const progress = useMemo(
    () => Math.min(100, Math.round((completedBlockCount / TOTAL_BLOCKS) * 100)),
    [completedBlockCount]
  );
  const requiredCoveredCount = useMemo(
    () => REQUIRED_QUESTION_KEYS.filter((k) => k in (session?.answers ?? {})).length,
    [session]
  );
  const minimumReached = requiredCoveredCount === TOTAL_REQUIRED;
  const requiredProgress = Math.round((requiredCoveredCount / TOTAL_REQUIRED) * 100);

  if (status === 'loading' || !session) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center text-slate-600">
        <Loader2 className="mr-2 size-5 animate-spin" /> Preparando tu entrevista…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center gap-3 text-center">
        <p className="text-red-700">{error ?? 'Algo salió mal'}</p>
        <Button onClick={() => reset()}>Reintentar</Button>
      </div>
    );
  }

  if (session.status === 'completed') {
    return (
      <CompletionView
        recommendations={recommendations}
        adminHref={adminHref}
        session={session}
        onRestart={reset}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="rounded-[28px] border border-amber-950/10 bg-[#fffaf0] p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Dossier de campaña
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
              Armemos tu primera estrategia de recaudación
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Hablá como en una entrevista. Cada respuesta se guarda y se va
              convirtiendo en un perfil usable para sugerirte campañas reales.
            </p>
          </div>
          <StatusBadge saveState={saveState} lastSavedAt={lastSavedAt} />
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Bloques entendidos</span>
            <span>
              {completedBlockCount} / {TOTAL_BLOCKS}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-amber-950/10">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Preguntas clave</span>
            <span
              className={cn(
                'transition-colors duration-300',
                minimumReached
                  ? 'font-semibold text-emerald-700'
                  : 'text-slate-500'
              )}
            >
              {minimumReached ? '✓ Mínimo cubierto' : `${requiredCoveredCount} / ${TOTAL_REQUIRED}`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-amber-950/10">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                minimumReached ? 'bg-emerald-500' : 'bg-amber-500'
              )}
              style={{ width: `${requiredProgress}%` }}
            />
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-[620px] flex-col overflow-hidden rounded-[28px] border border-amber-950/10 bg-white shadow-sm">
          <ChatPanel messages={session.messages} sending={sending} />
          {error && (
            <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <ChatInput
            disabled={false}
            sending={sending}
            onSend={sendMessage}
            uploadFile={uploadFile}
          />
        </section>

        <aside className="space-y-4">
          <DossierCard session={session} />

          <VoicePanel
            enabled={voiceEnabled}
            agentId={voiceAgentId}
            disabledReason={voiceDisabledReason}
            sessionId={session.id}
          />

          <div className="rounded-[24px] border border-amber-950/10 bg-[#fffaf0] p-4 shadow-sm">
            {minimumReached && (
              <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                <Check className="size-3.5 shrink-0" />
                Ya tenés lo mínimo para generar campañas
              </p>
            )}
            <Button
              onClick={() => complete(false)}
              disabled={sending || saveState === 'saving'}
              className={cn(
                'w-full text-white',
                minimumReached
                  ? 'bg-emerald-700 hover:bg-emerald-800'
                  : 'bg-slate-950 hover:bg-slate-800'
              )}
            >
              <Check className="size-4" /> Finalizar y ver sugerencias
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <Save className="size-3.5" /> Guardamos cada turno confirmado.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => reset()}
              className="mt-2 w-full text-slate-500"
            >
              <RotateCcw className="size-3.5" /> Empezar de nuevo
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function DossierCard({ session }: { session: OnboardingSession }) {
  const profile = session.profile;
  const facts = [
    profile.organization.name && ['ONG', profile.organization.name],
    profile.organization.cause && ['Causa', profile.organization.cause],
    profile.fundraising.mainChallenge && [
      'Desafío',
      profile.fundraising.mainChallenge
    ],
    profile.campaignSeed.useOfFunds && [
      'Fondos',
      profile.campaignSeed.useOfFunds
    ]
  ].filter(Boolean) as string[][];

  return (
    <div className="rounded-[24px] border border-amber-950/10 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="size-4 text-amber-700" />
        <h2 className="text-sm font-semibold text-slate-950">Lo que ya entendimos</h2>
      </div>
      <div className="space-y-3">
        {ONBOARDING_BLOCKS.map((block) => {
          const done = session.completedBlocks.includes(block.key);
          return (
            <div key={block.key} className="flex items-center gap-2 text-sm">
              {done ? (
                <Check className="size-4 text-emerald-600" />
              ) : (
                <Circle className="size-4 text-slate-300" />
              )}
              <span className={done ? 'text-slate-800' : 'text-slate-400'}>
                {block.title}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 border-t border-amber-950/10 pt-4">
        {facts.length > 0 ? (
          <dl className="space-y-3">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {label}
                </dt>
                <dd className="line-clamp-2 text-sm text-slate-700">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-500">
            Todavía no hay suficientes señales. Respondé las primeras preguntas y
            este dossier se empieza a llenar.
          </p>
        )}
      </div>
    </div>
  );
}

function CompletionView({
  session,
  recommendations,
  adminHref,
  onRestart
}: {
  session: OnboardingSession;
  recommendations: CampaignRecommendation[];
  adminHref: string;
  onRestart: () => Promise<void>;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="rounded-[28px] border border-emerald-900/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              <Check className="size-3.5" /> Perfil guardado
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Ya tenemos una estrategia inicial para tu ONG
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Estas sugerencias quedan guardadas en el admin para convertirlas en
              landings o tiendas cuando cargues método de pago e imágenes.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="bg-slate-950 text-white hover:bg-slate-800">
              <Link href={adminHref}>
                Ir al admin <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="ghost" onClick={() => void onRestart()}>
              <RotateCcw className="size-4" /> Rehacer entrevista
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recommendations.map((recommendation) => (
            <RecommendationCard key={recommendation.id} item={recommendation} />
          ))}
        </div>
        <DossierCard session={session} />
      </div>
    </div>
  );
}

function RecommendationCard({ item }: { item: CampaignRecommendation }) {
  const isStore = item.type === 'tienda';
  const Icon = isStore ? ShoppingBag : HeartHandshake;
  return (
    <div className="rounded-[24px] border border-amber-950/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-amber-100 p-2 text-amber-800">
          <Icon className="size-5" />
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {isStore ? 'Tienda' : 'Crowdfunding'}
        </span>
      </div>
      <h2 className="text-lg font-semibold leading-6 text-slate-950">{item.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
    </div>
  );
}

function StatusBadge({
  saveState,
  lastSavedAt
}: {
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: string | null;
}) {
  const label =
    saveState === 'saving'
      ? 'Guardando…'
      : saveState === 'error'
        ? 'No se pudo guardar'
        : lastSavedAt
          ? 'Guardado'
          : 'Listo para empezar';

  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
        saveState === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      )}
    >
      {saveState === 'saving' ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Save className="size-3.5" />
      )}
      {label}
    </span>
  );
}
