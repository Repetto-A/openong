'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, HeartHandshake, ShoppingBag, Upload, X } from 'lucide-react';
import { createCampaignAction } from '@/app/actions';
import {
  slugify,
  type CampaignType,
  type PaymentMethod
} from '@/lib/campaigns';
import type { CampaignRecommendation } from '@/lib/onboarding/types';

const TYPES: {
  value: CampaignType;
  label: string;
  description: string;
  icon: typeof HeartHandshake;
  disabled?: boolean;
}[] = [
  {
    value: 'crowdfunding',
    label: 'Crowdfunding',
    description: 'Una landing para recaudar fondos para una causa.',
    icon: HeartHandshake
  },
  {
    value: 'tienda',
    label: 'Tienda',
    description: 'Una tienda solidaria para vender productos o donaciones simbólicas.',
    icon: ShoppingBag
  }
];

type CreateCampaignDialogProps = {
  subdomain: string;
  trigger?: ReactNode;
  initialRecommendation?: CampaignRecommendation;
};

function buildInitialState(initialRecommendation?: CampaignRecommendation) {
  return {
    title: initialRecommendation?.title ?? '',
    type: initialRecommendation?.type ?? ('crowdfunding' as CampaignType),
    prompt: initialRecommendation?.promptSeed ?? '',
    recommendationId: initialRecommendation?.id
  };
}

export function CreateCampaignDialog({
  subdomain,
  trigger,
  initialRecommendation
}: CreateCampaignDialogProps) {
  const initialState = buildInitialState(initialRecommendation);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState(initialState.title);
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [type, setType] = useState<CampaignType>(initialState.type);
  const [prompt, setPrompt] = useState(initialState.prompt);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('mercadopago');
  const [paymentLink, setPaymentLink] = useState('');
  const [cbu, setCbu] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const previewSlug = useMemo(
    () => slugify(slugEdited ? slug : title),
    [slug, slugEdited, title]
  );
  const recommendationId = initialState.recommendationId;

  function reset() {
    setStep(1);
    setTitle(initialState.title);
    setSlug('');
    setSlugEdited(false);
    setType(initialState.type);
    setPrompt(initialState.prompt);
    setImages([]);
    setUploading(false);
    setPaymentMethod('mercadopago');
    setPaymentLink('');
    setCbu('');
    setError(null);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await Promise.all(
        Array.from(files).map(async (file) => {
          const body = new FormData();
          body.append('file', file);
          body.append('folder', `openong/${subdomain}`);
          const res = await fetch('/api/files/upload', {
            method: 'POST',
            body
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Error al subir');
          if (json.storageError) throw new Error(json.storageError);
          return json.attachment?.url as string | undefined;
        })
      );
      const urls = uploaded.filter((u): u is string => Boolean(u));
      setImages((prev) => [...prev, ...urls]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen');
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function goToPrompt() {
    setError(null);
    if (!title.trim()) {
      setError('Poné un título a tu campaña.');
      return;
    }
    if (!previewSlug) {
      setError('El título debe tener al menos una letra o número.');
      return;
    }
    setStep(2);
  }

  function submit() {
    setError(null);
    if (paymentMethod === 'mercadopago' && !paymentLink.trim()) {
      setError('Ingresá el link de pago de MercadoPago.');
      return;
    }
    if (paymentMethod === 'cbu' && !cbu.trim()) {
      setError('Ingresá el CBU o alias.');
      return;
    }
    startTransition(async () => {
      const result = await createCampaignAction(subdomain, {
        title: title.trim(),
        type,
        slug: previewSlug,
        prompt: prompt.trim(),
        images,
        recommendationId,
        payment: {
          method: paymentMethod,
          link: paymentMethod === 'mercadopago' ? paymentLink.trim() : undefined,
          cbu: paymentMethod === 'cbu' ? cbu.trim() : undefined
        }
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.slug) {
        // Hard navigation bypasses the Router Cache, guaranteeing a fresh
        // server render that sees the just-created campaign.
        window.location.href = `/campaigns/${result.slug}/edit`;
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nueva campaña
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Nueva campaña</DialogTitle>
              <DialogDescription>
                Elegí un tipo y un título. Generamos la URL de la página.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <div className="grid gap-2">
                  {TYPES.map((t) => {
                    const Icon = t.icon;
                    const selected = type === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        disabled={t.disabled || Boolean(recommendationId)}
                        onClick={() => {
                          if (recommendationId) return;
                          setType(t.value);
                        }}
                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-input hover:bg-gray-50'
                        } ${t.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        <Icon className="mt-0.5 h-5 w-5 text-gray-700" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {t.label}
                          </div>
                          <div className="text-xs text-gray-500">
                            {t.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  value={title}
                  placeholder="Ayudanos a financiar 100 kits escolares"
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={Boolean(recommendationId)}
                />
                {recommendationId && initialRecommendation && (
                  <p className="text-xs text-gray-500">
                    Esta sugerencia viene del onboarding y fija el enfoque base
                    de la campaña.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Ruta de la URL</Label>
                <Input
                  id="slug"
                  value={slugEdited ? slug : previewSlug}
                  placeholder="kits-escolares"
                  onChange={(e) => {
                    setSlugEdited(true);
                    setSlug(e.target.value);
                  }}
                />
                <p className="text-xs text-gray-500">
                  /{previewSlug || 'tu-ruta'}
                </p>
              </div>

              {error && <div className="text-sm text-red-500">{error}</div>}
            </div>

            <DialogFooter>
              <Button onClick={goToPrompt}>Siguiente</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Describí tu campaña</DialogTitle>
              <DialogDescription>
                Este prompt se le envía a la IA para construir tu página cuando
                la abrís.
              </DialogDescription>
            </DialogHeader>

            {recommendationId && initialRecommendation ? (
              <div className="space-y-2 rounded-lg border bg-blue-50/70 p-3">
                <Label>Sugerencia tomada del onboarding</Label>
                <p className="text-sm text-gray-700">
                  {initialRecommendation.reason}
                </p>
                <p className="text-xs text-gray-500">
                  La base de la página se genera automáticamente con el perfil
                  de la ONG y esta sugerencia.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt</Label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  placeholder="Creá una página emotiva de crowdfunding para recaudar $500.000 para 100 kits escolares. Incluí la historia, niveles de impacto y un llamado a donar."
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Método de pago</Label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'mercadopago', label: 'MercadoPago' },
                    { value: 'cbu', label: 'CBU / Transferencia' }
                  ] as const
                ).map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setPaymentMethod(m.value)}
                    className={`rounded-lg border p-2.5 text-sm font-medium transition-colors ${
                      paymentMethod === m.value
                        ? 'border-blue-500 bg-blue-50 text-gray-900'
                        : 'border-input text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {paymentMethod === 'mercadopago' ? (
                <Input
                  value={paymentLink}
                  placeholder="https://mpago.la/tu-link-de-pago"
                  onChange={(e) => setPaymentLink(e.target.value)}
                />
              ) : (
                <Input
                  value={cbu}
                  placeholder="CBU o alias (ej: ong.solidaria.mp)"
                  onChange={(e) => setCbu(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Imágenes (opcional)</Label>
              <p className="text-xs text-gray-500">
                Subí fotos para que la IA las use en la página.
              </p>
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((url) => (
                    <div key={url} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="h-16 w-16 rounded-md border border-input object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Quitar imagen"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50">
                <Upload className="h-4 w-4" />
                {uploading ? 'Subiendo...' : 'Agregar imágenes'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  className="hidden"
                  onChange={(e) => {
                    void handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            {error && <div className="text-sm text-red-500">{error}</div>}

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={isPending}
              >
                Volver
              </Button>
              <Button onClick={submit} disabled={isPending || uploading}>
                {isPending ? 'Creando...' : 'Crear campaña'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
