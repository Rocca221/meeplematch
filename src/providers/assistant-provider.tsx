import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';

/** Mensajes en el formato que entiende la función `assistant` (API de Claude). */
type ApiBlock = { type: string; [key: string]: unknown };
export type ApiMessage = { role: 'user' | 'assistant'; content: string | ApiBlock[] };

export type AssistantAction = {
  id: string;
  name: string;
  risk: 'read' | 'low' | 'high';
  summary: string;
  status: 'ok' | 'error' | 'rejected';
  error?: string;
};

export type PendingAction = {
  id: string;
  name: string;
  summary: string;
  risk: 'read' | 'low' | 'high';
};

export type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'action'; action: AssistantAction }
  | { id: string; kind: 'error'; text: string };

type AgentResponse = {
  messages: ApiMessage[];
  pending: PendingAction[];
  actions: AssistantAction[];
  reply: string;
  limitReached?: boolean;
};

type AssistantContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  items: ChatItem[];
  pending: PendingAction[];
  decisions: Record<string, 'approve' | 'reject'>;
  busy: boolean;
  confirmAll: boolean;
  setConfirmAll: (value: boolean) => void;
  send: (text: string) => void;
  decide: (id: string, decision: 'approve' | 'reject') => void;
  decideAll: (decision: 'approve' | 'reject') => void;
  retry: (() => void) | null;
  clear: () => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

const CONFIRM_KEY = 'meeplematch.assistant.confirmAll';
const chatKey = (userId: string) => `meeplematch.assistant.chat.${userId}`;
const MAX_ITEMS = 80;

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Si el historial termina con llamadas a herramientas sin resolver, se descarta ese turno. */
function dropDanglingTurn(messages: ApiMessage[]): ApiMessage[] {
  const last = messages[messages.length - 1];
  if (
    last?.role === 'assistant' &&
    Array.isArray(last.content) &&
    last.content.some((block) => block.type === 'tool_use')
  ) {
    return messages.slice(0, -1);
  }
  return messages;
}

async function readFunctionError(
  error: unknown,
  language: 'es' | 'en',
): Promise<{ message: string; code?: string }> {
  const t = (es: string, en: string) => (language === 'en' ? en : es);
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string; message?: string; code?: string };
      if (context.status === 404) {
        return {
          code: 'not_deployed',
          message: t(
            'El asistente todavía no está desplegado en el servidor.',
            'The assistant is not deployed on the server yet.',
          ),
        };
      }
      if (body.code === 'not_configured') {
        return {
          code: body.code,
          message: t(
            'El asistente todavía no está configurado: falta la clave del modelo de IA en el servidor.',
            'The assistant is not configured yet: the AI model key is missing on the server.',
          ),
        };
      }
      const message = body.error ?? body.message;
      if (message) return { message, code: body.code };
    } catch {
      // El cuerpo no era JSON: se usa el mensaje genérico de abajo.
    }
  }
  const text = error instanceof Error ? error.message : '';
  if (/failed to send|network|fetch/i.test(text)) {
    return {
      code: 'network',
      message: t(
        'No se pudo conectar con el asistente. Revisa tu conexión e inténtalo de nuevo.',
        'Could not reach the assistant. Check your connection and try again.',
      ),
    };
  }
  return {
    message: t('El asistente no pudo responder. Inténtalo de nuevo.', 'The assistant could not answer. Please try again.'),
  };
}

export function AssistantProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { language } = useLanguage();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [transcript, setTranscript] = useState<ApiMessage[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [decisions, setDecisions] = useState<Record<string, 'approve' | 'reject'>>({});
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAllState] = useState(false);
  const [failedRequest, setFailedRequest] = useState<{
    messages: ApiMessage[];
    decisions: Record<string, 'approve' | 'reject'>;
  } | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const busyRef = useRef(false);

  // Preferencia de confirmación y conversación guardada en el dispositivo.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(CONFIRM_KEY)
      .then((value) => {
        if (active && value === 'true') setConfirmAllState(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    AsyncStorage.getItem(chatKey(userId))
      .then((raw) => {
        if (!active) return;
        if (raw) {
          const saved = JSON.parse(raw) as { items?: ChatItem[]; transcript?: ApiMessage[] };
          setItems(Array.isArray(saved.items) ? saved.items.slice(-MAX_ITEMS) : []);
          setTranscript(Array.isArray(saved.transcript) ? dropDanglingTurn(saved.transcript) : []);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadedFor(userId);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || loadedFor !== userId || busy || pending.length) return;
    AsyncStorage.setItem(
      chatKey(userId),
      JSON.stringify({ items: items.slice(-MAX_ITEMS), transcript }),
    ).catch(() => undefined);
  }, [userId, loadedFor, items, transcript, busy, pending.length]);

  const setConfirmAll = useCallback((value: boolean) => {
    setConfirmAllState(value);
    AsyncStorage.setItem(CONFIRM_KEY, String(value)).catch(() => undefined);
  }, []);

  const call = useCallback(
    async (messages: ApiMessage[], nextDecisions: Record<string, 'approve' | 'reject'>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setFailedRequest(null);

      const { data, error } = await supabase.functions.invoke<AgentResponse>('assistant', {
        body: { messages, decisions: nextDecisions, confirmAll, language },
      });

      if (error || !data) {
        const failure = await readFunctionError(error, language);
        setItems((current) => [...current, { id: nextId(), kind: 'error', text: failure.message }]);
        if (failure.code !== 'not_configured' && failure.code !== 'not_deployed') {
          setFailedRequest({ messages, decisions: nextDecisions });
        }
      } else {
        setTranscript(data.messages);
        setPending(data.pending ?? []);
        setDecisions({});
        setItems((current) => {
          const next: ChatItem[] = [...current];
          for (const action of data.actions ?? []) {
            next.push({ id: `${nextId()}-${action.id}`, kind: 'action', action });
          }
          if (data.reply) next.push({ id: nextId(), kind: 'assistant', text: data.reply });
          return next.slice(-MAX_ITEMS);
        });
      }

      busyRef.current = false;
      setBusy(false);
    },
    [confirmAll, language],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current || pending.length) return;
      setItems((current) => [...current, { id: nextId(), kind: 'user' as const, text: trimmed }].slice(-MAX_ITEMS));
      void call([...transcript, { role: 'user', content: trimmed }], {});
    },
    [call, pending.length, transcript],
  );

  const decide = useCallback(
    (id: string, decision: 'approve' | 'reject') => {
      if (busyRef.current) return;
      const next = { ...decisions, [id]: decision };
      if (pending.every((action) => next[action.id])) {
        setPending([]);
        setDecisions({});
        void call(transcript, next);
      } else {
        setDecisions(next);
      }
    },
    [call, decisions, pending, transcript],
  );

  const decideAll = useCallback(
    (decision: 'approve' | 'reject') => {
      if (busyRef.current) return;
      const next = Object.fromEntries(pending.map((action) => [action.id, decision]));
      setPending([]);
      setDecisions({});
      void call(transcript, next);
    },
    [call, pending, transcript],
  );

  const clear = useCallback(() => {
    if (busyRef.current) return;
    setItems([]);
    setTranscript([]);
    setPending([]);
    setDecisions({});
    setFailedRequest(null);
  }, []);

  const retry = useCallback(() => {
    if (failedRequest) void call(failedRequest.messages, failedRequest.decisions);
  }, [call, failedRequest]);

  const value = useMemo<AssistantContextValue>(
    () => ({
      open,
      setOpen,
      items,
      pending,
      decisions,
      busy,
      confirmAll,
      setConfirmAll,
      send,
      decide,
      decideAll,
      retry: failedRequest ? retry : null,
      clear,
    }),
    [open, items, pending, decisions, busy, confirmAll, setConfirmAll, send, decide, decideAll, retry, failedRequest, clear],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) throw new Error('useAssistant must be used within an AssistantProvider.');
  return context;
}
