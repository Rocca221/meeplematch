/**
 * Bucle del agente, sin dependencias de Deno ni de Supabase para poder
 * probarlo con Node. Recibe el modelo y las herramientas por parámetro.
 *
 * Flujo:
 *  1. El modelo responde con texto y/o `tool_use`.
 *  2. Las herramientas de lectura y las de bajo riesgo se ejecutan solas.
 *  3. Las de alto riesgo (publicar, borrar, escribir a otras personas) se
 *     detienen: el servidor devuelve `pending` y espera la decisión del
 *     usuario. Al reanudar, el cliente reenvía la conversación con
 *     `decisions` y el agente continúa donde quedó.
 */

export type TextBlock = { type: 'text'; text: string };
export type ToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
export type Block = TextBlock | ToolUseBlock | ToolResultBlock;
export type Message = { role: 'user' | 'assistant'; content: string | Block[] };

export type Risk = 'read' | 'low' | 'high';
export type Language = 'es' | 'en';

export type ToolDefinition<Ctx> = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Riesgo según los argumentos concretos de la llamada. */
  risk: (input: Record<string, unknown>) => Risk;
  /** Texto legible para la tarjeta de confirmación y el historial. */
  describe: (input: Record<string, unknown>, ctx: Ctx, lang: Language) => Promise<string>;
  run: (input: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
};

export type PendingAction = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  summary: string;
  risk: Risk;
};

export type ActionLog = {
  id: string;
  name: string;
  risk: Risk;
  summary: string;
  status: 'ok' | 'error' | 'rejected';
  error?: string;
};

export type ModelResponse = { content: Block[]; stop_reason?: string | null };

export type AgentOptions<Ctx> = {
  messages: Message[];
  decisions?: Record<string, 'approve' | 'reject'>;
  confirmAll?: boolean;
  language: Language;
  ctx: Ctx;
  tools: ToolDefinition<Ctx>[];
  callModel: (messages: Message[]) => Promise<ModelResponse>;
  maxSteps?: number;
  maxMessages?: number;
  onAction?: (action: ActionLog, input: Record<string, unknown>) => Promise<void> | void;
};

export type AgentResult = {
  messages: Message[];
  pending: PendingAction[];
  actions: ActionLog[];
  reply: string;
  limitReached: boolean;
};

const MAX_RESULT_CHARS = 6000;

const isToolUse = (block: Block): block is ToolUseBlock => block.type === 'tool_use';
const isText = (block: Block): block is TextBlock => block.type === 'text';

export function textOf(content: string | Block[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter(isText)
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function toolUsesOf(message: Message | undefined): ToolUseBlock[] {
  if (!message || message.role !== 'assistant' || typeof message.content === 'string') return [];
  return message.content.filter(isToolUse);
}

/** Un turno empieza en un mensaje de usuario que es texto (no un tool_result). */
function startsTurn(message: Message): boolean {
  if (message.role !== 'user') return false;
  if (typeof message.content === 'string') return true;
  return message.content.length > 0 && message.content.every(isText);
}

/** Recorta los turnos más antiguos sin separar un tool_use de su tool_result. */
export function trimMessages(messages: Message[], maxMessages: number): Message[] {
  if (messages.length <= maxMessages) return messages;
  for (let index = messages.length - maxMessages; index < messages.length; index++) {
    if (startsTurn(messages[index])) return messages.slice(index);
  }
  // Un solo turno enorme: se conserva completo antes que romper pares.
  for (let index = messages.length - 1; index >= 0; index--) {
    if (startsTurn(messages[index])) return messages.slice(index);
  }
  return messages;
}

function truncate(text: string): string {
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}… [resultado recortado]`
    : text;
}

type ExecutionOutcome =
  | { kind: 'pending'; pending: PendingAction[] }
  | { kind: 'done'; results: ToolResultBlock[]; actions: ActionLog[] };

async function executeToolUses<Ctx>(
  uses: ToolUseBlock[],
  options: AgentOptions<Ctx>,
): Promise<ExecutionOutcome> {
  const registry = new Map(options.tools.map((tool) => [tool.name, tool]));
  const decisions = options.decisions ?? {};

  // 1) ¿Alguna llamada necesita confirmación y todavía no la tiene?
  const pending: PendingAction[] = [];
  for (const use of uses) {
    const tool = registry.get(use.name);
    if (!tool) continue;
    const risk = tool.risk(use.input ?? {});
    const needsConfirmation = risk === 'high' || (risk === 'low' && options.confirmAll === true);
    if (needsConfirmation && decisions[use.id] === undefined) {
      pending.push({
        id: use.id,
        name: use.name,
        input: use.input ?? {},
        summary: await tool.describe(use.input ?? {}, options.ctx, options.language).catch(
          () => tool.name,
        ),
        risk,
      });
    }
  }
  // El turno se ejecuta completo o no se ejecuta: así nunca queda a medias.
  if (pending.length) return { kind: 'pending', pending };

  // 2) Ejecutar en orden.
  const results: ToolResultBlock[] = [];
  const actions: ActionLog[] = [];
  for (const use of uses) {
    const tool = registry.get(use.name);
    const input = use.input ?? {};
    if (!tool) {
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: `Herramienta desconocida: ${use.name}.`,
        is_error: true,
      });
      continue;
    }

    const risk = tool.risk(input);
    const summary = await tool.describe(input, options.ctx, options.language).catch(() => tool.name);

    if (decisions[use.id] === 'reject') {
      const action: ActionLog = { id: use.id, name: use.name, risk, summary, status: 'rejected' };
      actions.push(action);
      await options.onAction?.(action, input);
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content:
          'El usuario rechazó esta acción. No la reintentes; pregúntale qué prefiere hacer.',
      });
      continue;
    }

    try {
      const output = await tool.run(input, options.ctx);
      const action: ActionLog = { id: use.id, name: use.name, risk, summary, status: 'ok' };
      actions.push(action);
      await options.onAction?.(action, input);
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: truncate(JSON.stringify(output ?? { ok: true })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const action: ActionLog = {
        id: use.id,
        name: use.name,
        risk,
        summary,
        status: 'error',
        error: message,
      };
      actions.push(action);
      await options.onAction?.(action, input);
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: `Error: ${message}`,
        is_error: true,
      });
    }
  }
  return { kind: 'done', results, actions };
}

export async function runAgent<Ctx>(options: AgentOptions<Ctx>): Promise<AgentResult> {
  const maxSteps = options.maxSteps ?? 6;
  let messages = trimMessages([...options.messages], options.maxMessages ?? 40);
  const actions: ActionLog[] = [];

  // Reanudar: el último mensaje es del asistente con llamadas sin resolver.
  const unresolved = toolUsesOf(messages[messages.length - 1]);
  if (unresolved.length) {
    const outcome = await executeToolUses(unresolved, options);
    if (outcome.kind === 'pending') {
      return { messages, pending: outcome.pending, actions, reply: '', limitReached: false };
    }
    actions.push(...outcome.actions);
    messages = [...messages, { role: 'user', content: outcome.results }];
  }

  for (let step = 0; step < maxSteps; step++) {
    const response = await options.callModel(messages);
    messages = [...messages, { role: 'assistant', content: response.content }];

    const uses = response.content.filter(isToolUse);
    if (!uses.length) {
      return {
        messages,
        pending: [],
        actions,
        reply: textOf(response.content),
        limitReached: false,
      };
    }

    const outcome = await executeToolUses(uses, { ...options, decisions: {} });
    if (outcome.kind === 'pending') {
      return {
        messages,
        pending: outcome.pending,
        actions,
        reply: textOf(response.content),
        limitReached: false,
      };
    }
    actions.push(...outcome.actions);
    messages = [...messages, { role: 'user', content: outcome.results }];
  }

  // Demasiados pasos: se cierra el turno de forma ordenada.
  const closing: Message = {
    role: 'user',
    content:
      'Has alcanzado el límite de pasos. Resume en pocas líneas qué lograste y qué falta, sin llamar herramientas.',
  };
  const final = await options.callModel([...messages, closing]);
  const reply = textOf(final.content);
  messages = [
    ...messages,
    closing,
    { role: 'assistant', content: [{ type: 'text', text: reply }] },
  ];
  return { messages, pending: [], actions, reply, limitReached: true };
}

/** Validación del historial que llega del cliente. */
export function sanitizeMessages(raw: unknown): Message[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 120) return null;
  const clean: Message[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return null;
    if (typeof content === 'string') {
      if (content.length > 6000) return null;
      clean.push({ role, content });
      continue;
    }
    if (!Array.isArray(content) || content.length > 40) return null;
    const blocks: Block[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') return null;
      const b = block as Record<string, unknown>;
      if (b.type === 'text' && typeof b.text === 'string') {
        blocks.push({ type: 'text', text: b.text.slice(0, 12000) });
      } else if (
        b.type === 'tool_use' &&
        typeof b.id === 'string' &&
        typeof b.name === 'string' &&
        b.input !== null &&
        typeof b.input === 'object'
      ) {
        blocks.push({
          type: 'tool_use',
          id: b.id,
          name: b.name,
          input: b.input as Record<string, unknown>,
        });
      } else if (
        b.type === 'tool_result' &&
        typeof b.tool_use_id === 'string' &&
        typeof b.content === 'string'
      ) {
        blocks.push({
          type: 'tool_result',
          tool_use_id: b.tool_use_id,
          content: b.content.slice(0, MAX_RESULT_CHARS + 100),
          ...(b.is_error === true ? { is_error: true } : {}),
        });
      } else {
        return null;
      }
    }
    clean.push({ role, content: blocks });
  }
  if (clean[0].role !== 'user') return null;
  return clean;
}
