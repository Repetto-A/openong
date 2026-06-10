'use client';

import { useState } from 'react';
import {
  ConversationProvider,
  useConversation
} from '@elevenlabs/react';
import {
  Info,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Volume2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VoiceAvailabilityReason } from '@/lib/onboarding/voice-config';

export function VoicePanel({
  enabled,
  agentId,
  disabledReason,
  sessionId
}: {
  enabled: boolean;
  agentId?: string;
  disabledReason: VoiceAvailabilityReason;
  sessionId: string;
}) {
  const live = enabled && Boolean(agentId);

  if (!live) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2">
          <Mic className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Completar por voz</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Preferis hablar en lugar de escribir? Hace la entrevista con nuestro
          agente de voz.
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-md bg-background p-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>{disabledVoiceMessage(disabledReason)}</span>
        </div>
      </div>
    );
  }

  return (
    <ConversationProvider>
      <VoiceCallControls sessionId={sessionId} />
    </ConversationProvider>
  );
}

function VoiceCallControls({ sessionId }: { sessionId: string }) {
  const [bootstrapping, setBootstrapping] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    startSession,
    endSession,
    status,
    message,
    isMuted,
    setMuted,
    isSpeaking,
    isListening
  } = useConversation();

  const handleStart = async () => {
    if (bootstrapping || status === 'connecting' || status === 'connected') {
      return;
    }

    setLocalError(null);
    setBootstrapping(true);

    try {
      const response = await fetch('/api/elevenlabs/signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId })
      });

      const payload = (await response.json()) as
        | {
            enabled: true;
            signedUrl: string;
          }
        | {
            enabled: false;
            reason?: string;
          };

      if (!response.ok || !payload.enabled || !('signedUrl' in payload)) {
        throw new Error('No pudimos iniciar la llamada ahora.');
      }

      startSession({
        signedUrl: payload.signedUrl,
        dynamicVariables: {
          session_id: sessionId
        }
      });
    } catch (error) {
      const nextError =
        error instanceof Error
          ? error.message
          : 'No pudimos iniciar la llamada ahora.';
      setLocalError(nextError);
    } finally {
      setBootstrapping(false);
    }
  };

  const connecting = bootstrapping || status === 'connecting';
  const connected = status === 'connected';
  const visibleError =
    status === 'error'
      ? message ?? localError ?? 'La llamada no pudo conectarse.'
      : localError;

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <Mic className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Completar por voz</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Toca un boton y arranca la llamada. Cuando conecte, vas a poder cortar
        o mutear desde aca.
      </p>

      {visibleError ? (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-background p-2 text-xs text-destructive">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>{visibleError}</span>
        </div>
      ) : null}

      {!connected ? (
        <Button
          type="button"
          size="sm"
          className="mt-3 w-full"
          disabled={connecting}
          onClick={handleStart}
        >
          {connecting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Conectando llamada...
            </>
          ) : (
            <>
              <Mic className="size-4" />
              Hablar con el agente
            </>
          )}
        </Button>
      ) : (
        <div className="mt-3 space-y-3 rounded-md border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Llamada en curso</p>
              <p className="text-xs text-muted-foreground">
                {getLiveLabel({ isSpeaking, isListening })}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Conectada
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMuted(!isMuted)}
            >
              {isMuted ? (
                <>
                  <Volume2 className="size-4" />
                  Activar mic
                </>
              ) : (
                <>
                  <MicOff className="size-4" />
                  Mutear
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setLocalError(null);
                endSession();
              }}
            >
              <PhoneOff className="size-4" />
              Cortar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function getLiveLabel({
  isSpeaking,
  isListening
}: {
  isSpeaking: boolean;
  isListening: boolean;
}) {
  if (isSpeaking) {
    return 'El agente esta hablando';
  }

  if (isListening) {
    return 'Te esta escuchando';
  }

  return 'Llamada lista';
}

function disabledVoiceMessage(reason: VoiceAvailabilityReason) {
  switch (reason) {
    case 'disabled_flag':
      return 'La entrevista por voz está desactivada en este entorno. Por ahora seguí por texto; toda la información se guarda igual.';
    case 'missing_agent_id':
      return 'Falta configurar el agente de ElevenLabs para habilitar la entrevista por voz.';
    case 'missing_api_key':
      return 'Falta la API key de ElevenLabs, así que la entrevista por voz no puede iniciarse todavía.';
    case 'missing_service_token':
      return 'Falta el token de servicio del agente de voz, así que no podríamos guardar bien la entrevista. Por ahora seguí por texto.';
    case 'ready':
    default:
      return 'El agente de voz requiere configuración adicional. Por ahora seguí por texto; toda la información se guarda igual.';
  }
}
