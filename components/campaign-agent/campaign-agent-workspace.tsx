'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CampaignState } from '@/lib/campaign-agent/types';

type ChatMessage = { role: 'assistant' | 'user'; content: string };

type ToolResponse<T> = T & { error?: string; message?: string; details?: unknown };

async function callTool<T>(tool: string, args: Record<string, unknown> = {}) {
  const res = await fetch('/api/campaign-agent/tool', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool, args })
  });
  const data = (await res.json()) as ToolResponse<T>;
  if (!res.ok) throw new Error(data.message || data.error || `Tool failed: ${tool}`);
  return data;
}

export function CampaignAgentWorkspace() {
  const [state, setState] = useState<CampaignState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const created = await callTool<{ draft: CampaignState['draft'] }>('create_campaign_draft', { title: 'Colecta solidaria' });
        const next = await callTool<CampaignState>('get_campaign_state', { campaignDraftId: created.draft.id });
        setState(next);
        setMessages([{ role: 'assistant', content: 'Arranquemos por lo operativo, no por la decoración. ¿Qué necesitan colectar concretamente? Por ejemplo: mochilas, abrigo, juguetes o alimentos.' }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo iniciar');
      }
    });
  }, []);

  function send() {
    if (!state || !input.trim()) return;
    const content = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content }]);
    startTransition(async () => {
      try {
        const res = await fetch('/api/campaign-agent/message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ campaignDraftId: state.draft.id, message: content, expectedVersion: state.draft.version })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'No se pudo guardar');
        setState(data.state);
        setMessages((prev) => [...prev, { role: 'assistant', content: data.assistantMessage }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo enviar');
      }
    });
  }

  async function refresh() {
    if (!state) return;
    const next = await callTool<CampaignState>('get_campaign_state', { campaignDraftId: state.draft.id });
    setState(next);
  }

  function runTool(tool: string, args: Record<string, unknown> = {}) {
    if (!state) return;
    startTransition(async () => {
      try {
        await callTool(tool, { campaignDraftId: state.draft.id, ...args });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falló la acción');
      }
    });
  }

  const progress = useMemo(() => {
    if (!state) return 0;
    return Math.round((state.draft.progress.answered / state.draft.progress.total) * 100);
  }, [state]);

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }

  if (!state) {
    return <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">Preparando el agente operativo…</div>;
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="flex min-h-[620px] flex-col rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Campaign Builder Agent</p>
          <h1 className="text-xl font-semibold text-gray-950">Colecta operativa</h1>
          <p className="text-sm text-gray-500">Preguntas una por vez. Cada respuesta actualiza el tablero.</p>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-4">
          {messages.map((m, i) => (
            <div key={i} className={`rounded-2xl px-4 py-3 text-sm ${m.role === 'assistant' ? 'bg-blue-50 text-gray-800' : 'ml-auto bg-gray-900 text-white'} max-w-[88%]`}>
              {m.content}
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t p-4">
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="Respondé una cosa por vez…" disabled={pending} />
          <Button onClick={send} disabled={pending || !input.trim()}>Enviar</Button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Tablero operativo</h2>
              <p className="text-sm text-gray-500">Lo que antes terminaba en planillas y WhatsApp.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{progress}%</span>
          </div>
          <div className="mt-4 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${progress}%` }} /></div>
          <div className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
            <Metric label="Mensajes" value={state.metrics.generatedMessages} />
            <Metric label="Contributions" value={state.metrics.managedContributions} />
            <Metric label="Pendientes" value={state.metrics.pendingContributions} />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Beneficiarios/grupos" empty="Todavía no hay grupos.">
            {state.beneficiaryGroups.map((g) => <Item key={g.id} title={g.name} body={`${g.estimatedCount || 'Sin cantidad'} · ${g.needs}`} />)}
            <QuickAdd label="Crear grupo demo" onClick={() => runTool('create_beneficiary_group', { name: state.draft.structured.beneficiarySummary || 'Grupo de beneficiarios', estimatedCount: state.draft.structured.targetCount ?? 0, needs: state.draft.structured.collectedItems ?? 'Donaciones' })} />
          </Panel>
          <Panel title="Puntos de recepción" empty="Todavía no hay puntos.">
            {state.receptionPoints.map((p) => <Item key={p.id} title={p.name} body={`${p.address} · ${p.schedule}`} />)}
            <QuickAdd label="Crear punto básico" onClick={() => runTool('create_reception_point', { name: 'Punto principal', address: state.draft.structured.deliveryLocation || 'Dirección a confirmar', schedule: state.draft.structured.deadline || 'Horario a confirmar' })} />
          </Panel>
          <Panel title="Contributions" empty="Todavía no hay donaciones comprometidas.">
            {state.contributions.map((c) => <Item key={c.id} title={c.items} body={c.status} />)}
            <QuickAdd label="Agregar compromiso demo" onClick={() => runTool('create_contribution', { items: state.draft.structured.collectedItems || 'Donación', status: 'committed' })} />
          </Panel>
          <Panel title="Mensajes copy-paste" empty="Todavía no generaste mensajes.">
            {state.messages.map((m) => <Item key={m.id} title={`${m.channel} · ${m.purpose}`} body={m.body} />)}
            <QuickAdd label="Generar mensajes" onClick={() => runTool('generate_campaign_messages')} />
          </Panel>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-gray-950">Publicación básica</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => runTool('generate_basic_page_sections')} disabled={pending}>Generar preview básica</Button>
            <Button variant="outline" onClick={() => runTool('mark_campaign_ready')} disabled={pending}>Marcar lista</Button>
            <Button onClick={() => runTool('publish_campaign', { confirm: true })} disabled={pending}>Publicar</Button>
          </div>
          {state.draft.safety.warnings.length > 0 && <p className="mt-3 text-sm text-amber-700">{state.draft.safety.warnings.join(' ')}</p>}
          {state.draft.safety.blockers.length > 0 && <p className="mt-3 text-sm text-red-700">{state.draft.safety.blockers.join(' ')}</p>}
          {state.draft.publishedSlug && <a className="mt-3 inline-block text-sm font-medium text-blue-700 underline" href={`/${state.draft.publishedSlug}`}>Ver campaña publicada</a>}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-gray-50 p-2"><div className="text-lg font-semibold text-gray-950">{value}</div><div>{label}</div></div>;
}

function Panel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  return <div className="rounded-2xl border bg-white p-4 shadow-sm"><h3 className="font-semibold text-gray-950">{title}</h3><div className="mt-3 space-y-2">{arr.length ? children : <p className="text-sm text-gray-500">{empty}</p>}</div></div>;
}

function Item({ title, body }: { title: string; body: string }) {
  return <div className="rounded-lg border bg-gray-50 p-3"><div className="text-sm font-medium text-gray-950">{title}</div><div className="mt-1 text-xs leading-5 text-gray-600">{body}</div></div>;
}

function QuickAdd({ label, onClick }: { label: string; onClick: () => void }) {
  return <Button type="button" variant="outline" size="sm" onClick={onClick}>{label}</Button>;
}
