// Anbieter-Adapter. Zwei Protokolle decken praktisch alle aktuellen Modelle ab:
//  - "anthropic": Claude über die offizielle Anthropic-SDK (Messages API)
//  - "openai" / "azure" / "openai-compatible": OpenAI-SDK (Chat Completions).
//    Darüber laufen auch Google Gemini, Mistral, xAI Grok, DeepSeek, Groq,
//    OpenRouter, Together, Perplexity sowie lokale Server wie Ollama, vLLM,
//    LM Studio oder LocalAI.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI, { AzureOpenAI } from 'openai';
import { decrypt } from './security.js';

// Claude-Modelle, für die der serverseitige Refusal-Fallback aktiviert wird:
// lehnt das Modell eine Anfrage aus Sicherheitsgründen ab, beantwortet die API
// sie automatisch mit einem passenden Ersatzmodell.
const FALLBACK_MODELS = new Set([
  'claude-fable-5-2',
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

function providerOptions(provider) {
  try {
    return JSON.parse(provider.options_json || '{}');
  } catch {
    return {};
  }
}

function anthropicClient(provider) {
  return new Anthropic({
    apiKey: decrypt(provider.api_key_enc),
    baseURL: provider.base_url || undefined,
    maxRetries: 2,
  });
}

function openaiClient(provider, deployment) {
  const opts = providerOptions(provider);
  if (provider.type === 'azure') {
    return new AzureOpenAI({
      apiKey: decrypt(provider.api_key_enc),
      endpoint: provider.base_url,
      apiVersion: opts.apiVersion || '2024-10-21',
      deployment,
      maxRetries: 2,
    });
  }
  return new OpenAI({
    // Lokale Server (Ollama, vLLM …) brauchen oft keinen Schlüssel.
    apiKey: decrypt(provider.api_key_enc) || 'kein-schluessel',
    baseURL: provider.base_url || undefined,
    maxRetries: 2,
  });
}

// Aufeinanderfolgende Nachrichten derselben Rolle zusammenführen (z. B. wenn
// eine frühere Antwort fehlgeschlagen ist) – nicht jede API akzeptiert das.
function normalizeMessages(messages) {
  const out = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/**
 * Streamt eine Chat-Antwort.
 * @returns {Promise<{inputTokens:number, outputTokens:number, notice?:string}>}
 */
export async function streamChat({ provider, model, system, messages, signal, onText }) {
  const msgs = normalizeMessages(messages);
  if (provider.type === 'anthropic') return streamAnthropic({ provider, model, system, msgs, signal, onText });
  return streamOpenAI({ provider, model, system, msgs, signal, onText });
}

async function streamAnthropic({ provider, model, system, msgs, signal, onText }) {
  const client = anthropicClient(provider);
  const params = {
    model: model.model_id,
    max_tokens: model.max_tokens || 32000,
    messages: msgs,
  };
  if (system) params.system = system;
  if (model.effort) params.output_config = { effort: model.effort };

  // Fallback nur direkt bei Anthropic (nicht über Proxys/Gateways mit eigener base_url).
  const useFallback = FALLBACK_MODELS.has(model.model_id) && !provider.base_url;
  const stream = useFallback
    ? client.beta.messages.stream(
        { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
        { signal }
      )
    : client.messages.stream(params, { signal });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onText(event.delta.text);
  }
  const final = await stream.finalMessage();
  let notice;
  if (final.stop_reason === 'refusal') notice = 'Das Modell hat diese Anfrage abgelehnt.';
  else if (final.stop_reason === 'max_tokens') notice = 'Die Antwort wurde wegen der Längenbegrenzung abgeschnitten.';
  if (useFallback && final.model && final.model !== model.model_id && final.stop_reason !== 'refusal') {
    notice = `Beantwortet durch Ersatzmodell ${final.model}.`;
  }
  const u = final.usage || {};
  return {
    inputTokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
    outputTokens: u.output_tokens || 0,
    notice,
  };
}

async function streamOpenAI({ provider, model, system, msgs, signal, onText }) {
  const client = openaiClient(provider, model.model_id);
  const req = {
    model: model.model_id,
    messages: system ? [{ role: 'system', content: system }, ...msgs] : msgs,
    stream: true,
    stream_options: { include_usage: true },
  };
  const official = provider.type === 'openai' || provider.type === 'azure';
  if (model.max_tokens) req[official ? 'max_completion_tokens' : 'max_tokens'] = model.max_tokens;
  if (model.effort) req.reasoning_effort = model.effort;

  const stream = await client.chat.completions.create(req, { signal });
  let usage = null;
  let finish = null;
  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    if (choice?.delta?.content) onText(choice.delta.content);
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }
  let notice;
  if (finish === 'length') notice = 'Die Antwort wurde wegen der Längenbegrenzung abgeschnitten.';
  if (finish === 'content_filter') notice = 'Die Antwort wurde vom Inhaltsfilter des Anbieters blockiert.';
  return {
    inputTokens: usage?.prompt_tokens || 0,
    outputTokens: usage?.completion_tokens || 0,
    notice,
  };
}

/** Verfügbare Modelle beim Anbieter abfragen. */
export async function discoverModels(provider) {
  if (provider.type === 'azure') {
    throw new Error('Azure OpenAI: Bitte die Deployment-Namen manuell als Modell-ID eintragen.');
  }
  const out = [];
  if (provider.type === 'anthropic') {
    for await (const m of anthropicClient(provider).models.list()) out.push({ id: m.id, name: m.display_name || m.id });
  } else {
    for await (const m of openaiClient(provider).models.list()) out.push({ id: m.id, name: m.id });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Fehlermeldungen der Anbieter für Benutzer aufbereiten (ohne Schlüssel/Interna). */
export function describeError(err) {
  if (err?.name === 'AbortError' || err?.constructor?.name === 'APIUserAbortError') return 'Abgebrochen.';
  const status = err?.status;
  const map = {
    400: 'Die Anfrage wurde vom Anbieter abgelehnt (ungültige Parameter).',
    401: 'Der API-Schlüssel des Anbieters ist ungültig. Bitte Administrator informieren.',
    403: 'Kein Zugriff auf dieses Modell beim Anbieter.',
    404: 'Das Modell wurde beim Anbieter nicht gefunden.',
    413: 'Die Anfrage ist zu groß.',
    429: 'Der Anbieter ist ausgelastet oder das Kontingent ist erschöpft. Bitte später erneut versuchen.',
    529: 'Der Anbieter ist derzeit überlastet. Bitte später erneut versuchen.',
  };
  if (status && map[status]) return map[status];
  if (status >= 500) return 'Der Anbieter hat einen Serverfehler gemeldet. Bitte später erneut versuchen.';
  if (err?.code === 'ECONNREFUSED' || /connect|fetch failed|ENOTFOUND/i.test(String(err?.message)))
    return 'Der Anbieter ist nicht erreichbar.';
  return 'Unerwarteter Fehler beim Anbieter.';
}

export function detailError(err) {
  // Technische Details für das Admin-Protokoll / die Admin-Oberfläche.
  const msg = err?.error?.error?.message || err?.error?.message || err?.message || String(err);
  return `${err?.status ? `HTTP ${err.status}: ` : ''}${msg}`.slice(0, 500);
}
