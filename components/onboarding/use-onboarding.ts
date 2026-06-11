'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CampaignRecommendation,
  ChatAttachment,
  OnboardingSession
} from '@/lib/onboarding/types';

type Status = 'idle' | 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type SessionPayload = {
  session: OnboardingSession;
  recommendations?: CampaignRecommendation[];
};

export type UseOnboarding = ReturnType<typeof useOnboarding>;

export function useOnboarding(subdomain?: string) {
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [recommendations, setRecommendations] = useState<
    CampaignRecommendation[]
  >([]);
  const [status, setStatus] = useState<Status>('idle');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  const storageKey = useMemo(
    () =>
      subdomain
        ? `onboarding:sessionId:${subdomain}`
        : 'onboarding:sessionId',
    [subdomain]
  );

  const markSaved = useCallback((nextSession: OnboardingSession) => {
    setSession(nextSession);
    setSaveState('saved');
    setLastSavedAt(nextSession.updatedAt ?? new Date().toISOString());
  }, []);

  const loadSession = useCallback(
    async (id: string): Promise<boolean> => {
      const res = await fetch(`/api/onboarding/session/${id}`);
      if (!res.ok) return false;
      const data = (await res.json()) as SessionPayload;
      markSaved(data.session);
      setRecommendations(data.recommendations ?? []);
      return true;
    },
    [markSaved]
  );

  const createSession = useCallback(async () => {
    setSaveState('saving');
    const res = await fetch('/api/onboarding/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subdomain })
    });
    if (!res.ok) throw new Error('No se pudo crear la sesión de onboarding');
    const data = (await res.json()) as SessionPayload;
    markSaved(data.session);
    setRecommendations([]);
    try {
      localStorage.setItem(storageKey, data.session.id);
    } catch {
      /* ignore storage errors */
    }
  }, [markSaved, storageKey, subdomain]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      setStatus('loading');
      try {
        let resumed = false;
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored) resumed = await loadSession(stored);
        } catch {
          /* ignore */
        }
        if (!resumed) await createSession();
        setStatus('ready');
      } catch (e) {
        setSaveState('error');
        setError(e instanceof Error ? e.message : 'Error desconocido');
        setStatus('error');
      }
    })();
  }, [createSession, loadSession, storageKey]);

  const uploadFile = useCallback(
    async (file: File): Promise<ChatAttachment> => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: form
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al subir el archivo');
      return data.attachment as ChatAttachment;
    },
    []
  );

  const sendMessage = useCallback(
    async (message: string, attachments: ChatAttachment[] = []): Promise<boolean> => {
      if (!session) return false;
      setSending(true);
      setSaveState('saving');
      setError(null);

      const optimistic: OnboardingSession = {
        ...session,
        messages: [
          ...session.messages,
          {
            id: `tmp-${Date.now()}`,
            role: 'user',
            content: message,
            attachments: attachments.length ? attachments : undefined,
            createdAt: new Date().toISOString()
          }
        ]
      };
      setSession(optimistic);

      try {
        const res = await fetch('/api/onboarding/message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, message, attachments })
        });
        const data = (await res.json()) as SessionPayload & { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Error al enviar el mensaje');
        markSaved(data.session);
        if (data.recommendations) {
          setRecommendations(data.recommendations);
        }
        return true;
      } catch (e) {
        setSaveState('error');
        setError(e instanceof Error ? e.message : 'Error al enviar');
        setSession(session);
        return false;
      } finally {
        setSending(false);
      }
    },
    [markSaved, session]
  );

  const complete = useCallback(
    async (force = false) => {
      if (!session) return false;
      setError(null);
      setSaveState('saving');
      try {
        const res = await fetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, force })
        });
        const data = (await res.json()) as SessionPayload & { error?: string };
        if (!res.ok) {
          throw new Error(
            data.error ?? 'Todavía faltan datos mínimos para finalizar'
          );
        }
        markSaved(data.session);
        setRecommendations(data.recommendations ?? []);
        return true;
      } catch (e) {
        setSaveState('error');
        setError(e instanceof Error ? e.message : 'Error al finalizar');
        return false;
      }
    },
    [markSaved, session]
  );

  const reset = useCallback(async () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setSession(null);
    setRecommendations([]);
    setSaveState('idle');
    setLastSavedAt(null);
    initialized.current = false;
    setStatus('loading');
    await createSession();
    setStatus('ready');
  }, [createSession, storageKey]);

  return {
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
  };
}
