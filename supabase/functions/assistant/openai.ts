/**
 * Adaptador entre el formato interno del agente (bloques text / tool_use /
 * tool_result) y la API de chat compatible con OpenAI que ofrece Groq.
 * Es puro (sin Deno ni red) para poder probarlo con Node.
 */
import type { Block, Message, ModelResponse } from './agent.ts';

export type OpenAiToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type OpenAiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ToolSpec = { name: string; description: string; input_schema: Record<string, unknown> };

export function toOpenAiTools(tools: ToolSpec[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
  }));
}

/**
 * Los resultados de herramientas de turnos anteriores ya cumplieron su función:
 * se recortan para gastar menos tokens por minuto (el plan gratuito es limitado).
 */
export function compactOlderToolResults(messages: Message[], maxChars = 300): Message[] {
  let turnStart = 0;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const startsTurn =
      message.role === 'user' &&
      (typeof message.content === 'string' ||
        (message.content.length > 0 && message.content.every((block) => block.type === 'text')));
    if (startsTurn) {
      turnStart = index;
      break;
    }
  }
  return messages.map((message, index) => {
    if (index >= turnStart || typeof message.content === 'string') return message;
    return {
      ...message,
      content: message.content.map((block): Block =>
        block.type === 'tool_result' && block.content.length > maxChars
          ? { ...block, content: `${block.content.slice(0, maxChars)}… [recortado]` }
          : block,
      ),
    };
  });
}

export function toOpenAiMessages(system: string, messages: Message[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }

    if (message.role === 'assistant') {
      const text = message.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { text: string }).text)
        .join('\n')
        .trim();
      const calls: OpenAiToolCall[] = message.content
        .filter((block) => block.type === 'tool_use')
        .map((block) => {
          const use = block as { id: string; name: string; input: Record<string, unknown> };
          return {
            id: use.id,
            type: 'function' as const,
            function: { name: use.name, arguments: JSON.stringify(use.input ?? {}) },
          };
        });
      out.push({
        role: 'assistant',
        ...(text ? { content: text } : {}),
        ...(calls.length ? { tool_calls: calls } : {}),
      });
      continue;
    }

    // Mensaje de usuario con bloques: los tool_result van primero (como `tool`).
    for (const block of message.content) {
      if (block.type === 'tool_result') {
        out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content });
      }
    }
    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { text: string }).text)
      .join('\n')
      .trim();
    if (text) out.push({ role: 'user', content: text });
  }
  return out;
}

let generated = 0;

export function fromOpenAiResponse(data: unknown): ModelResponse {
  const choice = (data as { choices?: { message?: Record<string, unknown>; finish_reason?: string }[] })
    ?.choices?.[0];
  const message = choice?.message ?? {};
  const blocks: Block[] = [];

  const content = typeof message.content === 'string' ? message.content.trim() : '';
  if (content) blocks.push({ type: 'text', text: content });

  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const call of calls as Record<string, unknown>[]) {
    const fn = (call.function ?? {}) as { name?: unknown; arguments?: unknown };
    if (typeof fn.name !== 'string' || !fn.name) continue;
    let input: Record<string, unknown> = {};
    if (typeof fn.arguments === 'string' && fn.arguments.trim()) {
      try {
        const parsed = JSON.parse(fn.arguments);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed;
      } catch {
        // Argumentos mal formados: la herramienta devolverá un error claro y el modelo reintenta.
      }
    }
    blocks.push({
      type: 'tool_use',
      id: typeof call.id === 'string' && call.id ? call.id : `call_${Date.now().toString(36)}_${generated++}`,
      name: fn.name,
      input,
    });
  }

  return {
    content: blocks.length ? blocks : [{ type: 'text', text: '…' }],
    stop_reason: choice?.finish_reason ?? null,
  };
}
