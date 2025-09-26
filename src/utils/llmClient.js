// SDK adapter for multiple providers: OpenAI-compatible via OpenAI SDK,
// Anthropic (Claude) via Anthropic SDK.

import OpenAI from "openai";
import { Ollama } from "ollama/browser";
import Anthropic from "@anthropic-ai/sdk";
import Cerebras from "@cerebras/cerebras_cloud_sdk";

// Detect SDK provider based on endpoint or explicit hint
export function detectSdkProvider({ endpoint, providerHint }) {
  const url = (endpoint || "").toLowerCase();
  if (providerHint === 'claude' || url.includes('anthropic')) return 'anthropic';
  if (providerHint === 'openai' || url.includes('openai.com')) return 'openai';
  if (providerHint === 'openrouter' || url.includes('openrouter.ai')) return 'openai';
  if (providerHint === 'deepseek' || url.includes('deepseek.com')) return 'openai';
  if (providerHint === 'cerebras' || url.includes('cerebras.ai')) return 'cerebras';
  if (providerHint === 'ollama' || url.includes('11434') || url.includes('ollama')) return 'openai';
  if (providerHint === 'lmstudio' || url.includes('1234') || url.includes('lmstudio')) return 'openai';
  return 'custom';
}

function normalizeOpenAIBaseURL(endpoint) {
  if (!endpoint) return "https://api.openai.com/v1";
  return endpoint.replace(/\/+$/, '');
}

function mapToAnthropic(messages) {
  let system;
  const mapped = [];
  for (const m of messages || []) {
    if (m.role === 'system') {
      const text = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content) ? m.content.filter(x => x?.type === 'text').map(x => x.text).join('\n') : String(m.content || '');
      system = [system, text].filter(Boolean).join('\n');
    } else if (m.role === 'user' || m.role === 'assistant') {
      const text = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content) ? m.content.filter(x => x?.type === 'text').map(x => x.text).join('\n') : String(m.content || '');
      mapped.push({ role: m.role, content: [{ type: 'text', text }] });
    }
  }
  return { system, messages: mapped };
}

// Create a ReadableStream emitting OpenAI-style SSE lines for {choices[0].delta.content}
function toSSEStreamFromAsyncIterator(asyncIterator) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const part of asyncIterator) {
          const delta = part?.choices?.[0]?.delta?.content || '';
          if (delta) {
            const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
            controller.enqueue(encoder.encode(sse));
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    }
  });
}

export async function streamChatViaSDK({ provider, apiKey, endpoint, model, messages, abortSignal }) {
  if (provider === 'anthropic') {
    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      baseURL: (endpoint || '').replace(/\/v1\/?$/, '') || undefined
    });
    const { system, messages: mapped } = mapToAnthropic(messages);
    const stream = await client.messages.stream({
      model,
      system,
      messages: mapped,
      max_tokens: 2000,
      temperature: 0.5
    });
    // Normalize Anthropic SDK events into SSE for consistent parsing in Chat.jsx
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        stream.on('text', (delta) => {
          const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
          controller.enqueue(encoder.encode(sse));
        });
        stream.on('end', () => {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        });
        stream.on('error', (err) => controller.error(err));
        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            try { stream.controller?.abort(); } catch {}
            controller.close();
          }, { once: true });
        }
      }
    });
    return { stream: readable };
  }

  if (provider === 'cerebras') {
    const client = new Cerebras({ apiKey, baseURL: (endpoint || '').replace(/\/$/, '') || undefined });
    const iterator = (async function* () {
      const stream = await client.chat.completions.create({ model, messages, stream: true });
      for await (const part of stream) {
        const content = part?.choices?.[0]?.delta?.content || '';
        if (content) {
          yield { choices: [{ delta: { content } }] };
        }
      }
    })();
    return { stream: toSSEStreamFromAsyncIterator(iterator) };
  }

  // Ollama handled via OpenAI-compatible baseURL (no SDK)

  // LM Studio handled via OpenAI-compatible baseURL (no SDK)

  // If endpoint indicates Ollama, use ollama-js to stream
  if (String(endpoint || '').includes('11434') || String(endpoint || '').includes('ollama')) {
    try {
      const baseUrl = (endpoint || 'http://127.0.0.1:11434').replace(/\/v1\/?$/, '');
      const client = new Ollama({ host: baseUrl });
      const iterator = (async function* () {
        const res = await client.chat({ model, messages, stream: true });
        for await (const part of res) {
          const content = part?.message?.content || '';
          // Normalize to OpenAI-like shape so downstream SSE builder is consistent
          yield { choices: [{ delta: { content } }] };
        }
      })();
      return { stream: toSSEStreamFromAsyncIterator(iterator) };
    } catch (_) {
      // fall through to OpenAI-compatible path
    }
  }

  // Default: OpenAI SDK (works for OpenAI, DeepSeek, OpenRouter, LM Studio via baseURL)
  const client = new OpenAI({
    apiKey,
    baseURL: normalizeOpenAIBaseURL(endpoint),
    dangerouslyAllowBrowser: true
  });

  const stream = await client.chat.completions.create({ model, messages, stream: true });
  // Always normalize SDK stream into SSE for consistent parsing in Chat.jsx
  const iterator = (async function* () { for await (const part of stream) yield part; })();
  return { stream: toSSEStreamFromAsyncIterator(iterator) };
}

export async function completeOnceViaSDK({ provider, apiKey, endpoint, model, messages }) {
  if (provider === 'anthropic') {
    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      baseURL: (endpoint || '').replace(/\/v1\/?$/, '') || undefined
    });
    const { system, messages: mapped } = mapToAnthropic(messages);
    const res = await client.messages.create({ model, system, messages: mapped, max_tokens: 2000, temperature: 0.5 });
    const text = (res?.content || []).map(b => b?.type === 'text' ? b.text : '').join('');
    return { content: text };
  }

  if (provider === 'cerebras') {
    const client = new Cerebras({ apiKey, baseURL: (endpoint || '').replace(/\/$/, '') || undefined });
    const res = await client.chat.completions.create({ model, messages, stream: false });
    const content = res?.choices?.[0]?.message?.content || '';
    return { content };
  }

  // Ollama handled via OpenAI-compatible baseURL (no SDK)

  // LM Studio handled via OpenAI-compatible baseURL (no SDK)

  // If endpoint indicates Ollama, use ollama-js for non-stream
  if (String(endpoint || '').includes('11434') || String(endpoint || '').includes('ollama')) {
    try {
      const baseUrl = (endpoint || 'http://127.0.0.1:11434').replace(/\/v1\/?$/, '');
      const client = new Ollama({ host: baseUrl });
      const res = await client.chat({ model, messages, stream: false });
      const content = res?.message?.content || '';
      return { content };
    } catch (_) {
      // fall through to OpenAI-compatible path
    }
  }

  const client = new OpenAI({
    apiKey,
    baseURL: normalizeOpenAIBaseURL(endpoint),
    dangerouslyAllowBrowser: true
  });
  const res = await client.chat.completions.create({ model, messages, stream: false, temperature: 0.5, max_tokens: 2000 });
  const content = res?.choices?.[0]?.message?.content || '';
  return { content };
}

// Static list for Anthropic when listing models (API may not expose list)
const ANTHROPIC_MODELS = [
  "claude-3-5-sonnet-20240620",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "claude-3-haiku-20240307"
];

export async function listModelsViaSDK({ provider, apiKey, endpoint }) {
  try {
    if (provider === 'anthropic') {
      return ANTHROPIC_MODELS;
    }

    if (provider === 'cerebras') {
      try {
        const client = new Cerebras({ apiKey, baseURL: (endpoint || '').replace(/\/$/, '') || undefined });
        const list = await client.models.list();
        const models = Array.isArray(list?.data) ? list.data.map(m => m?.id).filter(Boolean) : [];
        if (models.length > 0) return models;
      } catch (_) {}
    }

    // If endpoint indicates Ollama, use ollama list
    if (String(endpoint || '').includes('11434') || String(endpoint || '').includes('ollama')) {
      try {
        const baseUrl = (endpoint || 'http://127.0.0.1:11434').replace(/\/v1\/?$/, '');
        const client = new Ollama({ host: baseUrl });
        const res = await client.list();
        const models = Array.isArray(res?.models) ? res.models.map(m => m?.name).filter(Boolean) : [];
        if (models.length > 0) return models;
      } catch (_) {}
    }

    // LM Studio handled by generic OpenAI-compatible fallback below

    // Default OpenAI-compatible via OpenAI SDK (OpenAI/DeepSeek/OpenRouter/LM Studio)
    const client = new OpenAI({
      apiKey,
      baseURL: normalizeOpenAIBaseURL(endpoint),
      dangerouslyAllowBrowser: true
    });
    const list = await client.models.list();
    const models = Array.isArray(list?.data) ? list.data.map(m => m?.id).filter(Boolean) : [];
    return models;
  } catch (_) {
    // Generic REST fallback to /v1/models for any provider exposing it
    try {
      const base = normalizeOpenAIBaseURL(endpoint);
      const res = await fetch(`${base}/models`, {
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }
      });
      const data = await res.json();
      return Array.isArray(data?.data) ? data.data.map(m => m?.id).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }
}


