'use client';

import { useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OnboardingMessage } from '@/lib/onboarding/types';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatPanel({
  messages,
  sending
}: {
  messages: OnboardingMessage[];
  sending?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: messages.length <= 1 ? 'auto' : 'smooth'
    });
  }, [messages.length, sending]);

  return (
    <div ref={containerRef} className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn(
            'flex',
            m.role === 'user' ? 'justify-end' : 'justify-start'
          )}
        >
          <div
            className={cn(
              'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
              m.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-muted text-foreground rounded-bl-sm'
            )}
          >
            {m.content && <p>{m.content}</p>}

            {m.attachments && m.attachments.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {m.attachments.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs',
                      m.role === 'user'
                        ? 'border-primary-foreground/30 bg-primary-foreground/10'
                        : 'border-border bg-background'
                    )}
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="max-w-44 truncate font-medium">
                      {a.fileName}
                    </span>
                    <span className="opacity-70">{formatSize(a.size)}</span>
                    {!a.extractedText && (
                      <span className="opacity-70">· extracción pendiente</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {sending && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
            <div className="flex gap-1">
              <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
              <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
              <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
