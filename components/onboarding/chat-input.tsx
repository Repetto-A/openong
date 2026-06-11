'use client';

import { useRef, useState } from 'react';
import { Paperclip, Send, X, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChatAttachment } from '@/lib/onboarding/types';

const ACCEPT =
  '.pdf,.txt,.md,.markdown,.csv,.docx,image/png,image/jpeg,image/webp,text/plain,text/markdown,text/csv,application/pdf';

type PendingAttachment = {
  localId: string;
  fileName: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
  attachment?: ChatAttachment;
};

type Props = {
  disabled?: boolean;
  sending?: boolean;
  onSend: (message: string, attachments: ChatAttachment[]) => Promise<boolean>;
  uploadFile: (file: File) => Promise<ChatAttachment>;
};

/**
 * Chat composer with file-attachment support.
 * Files upload immediately on selection; the message is sent with the
 * already-uploaded attachment metadata.
 */
export function ChatInput({ disabled, sending, onSend, uploadFile }: Props) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploading = pending.some((p) => p.status === 'uploading');
  const ready = pending
    .filter((p) => p.status === 'done' && p.attachment)
    .map((p) => p.attachment as ChatAttachment);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const localId = `${file.name}-${Date.now()}-${Math.random()}`;
      setPending((prev) => [
        ...prev,
        { localId, fileName: file.name, status: 'uploading' }
      ]);
      try {
        const attachment = await uploadFile(file);
        setPending((prev) =>
          prev.map((p) =>
            p.localId === localId ? { ...p, status: 'done', attachment } : p
          )
        );
      } catch (e) {
        setPending((prev) =>
          prev.map((p) =>
            p.localId === localId
              ? {
                  ...p,
                  status: 'error',
                  error: e instanceof Error ? e.message : 'Error'
                }
              : p
          )
        );
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  function removePending(localId: string) {
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  }

  async function submit() {
    if (disabled || sending || uploading) return;
    if (!text.trim() && ready.length === 0) return;
    const ok = await onSend(text.trim(), ready);
    if (ok) {
      setText('');
      setPending([]);
    }
  }

  return (
    <div className="border-t bg-background p-3">
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pending.map((p) => (
            <div
              key={p.localId}
              className={cn(
                'flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs',
                p.status === 'error' && 'border-destructive text-destructive'
              )}
            >
              {p.status === 'uploading' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileText className="size-3.5" />
              )}
              <span className="max-w-40 truncate">{p.fileName}</span>
              {p.status === 'error' && (
                <span className="text-destructive">· {p.error}</span>
              )}
              <button
                type="button"
                onClick={() => removePending(p.localId)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Quitar ${p.fileName}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          aria-label="Adjuntar archivo"
          title="Adjuntar archivo (PDF, TXT, MD, CSV)"
        >
          <Paperclip className="size-4" />
        </Button>

        <textarea
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Escribí tu respuesta…"
          className="max-h-32 min-h-9 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        />

        <Button
          type="button"
          size="icon"
          disabled={disabled || sending || uploading}
          onClick={submit}
          aria-label="Enviar"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
