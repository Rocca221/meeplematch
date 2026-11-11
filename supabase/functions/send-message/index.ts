import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SendMessageBody = {
  conversationId?: unknown;
  body?: unknown;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Missing Supabase environment configuration.');
    return jsonResponse({ error: 'Server configuration error.' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Invalid or expired session.' }, 401);
  }

  const { data: suspension, error: suspensionError } = await adminClient
    .from('user_suspensions')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (suspensionError) {
    console.error('Suspension lookup failed:', suspensionError.message);
    return jsonResponse({ error: 'Could not verify the account.' }, 500);
  }
  if (suspension) {
    return jsonResponse({ error: 'Tu cuenta está suspendida.' }, 403);
  }

  let input: SendMessageBody;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }
  if (!input || typeof input !== 'object') {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const conversationId =
    typeof input.conversationId === 'string' ? input.conversationId : '';
  const messageBody = typeof input.body === 'string' ? input.body.trim() : '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      conversationId,
    ) ||
    !messageBody ||
    messageBody.length > 4000
  ) {
    return jsonResponse({ error: 'Invalid conversation or message.' }, 400);
  }

  const { data: conversation, error: conversationError } = await adminClient
    .from('conversations')
    .select('invitation_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (conversationError) {
    console.error('Conversation lookup failed:', conversationError.message);
    return jsonResponse({ error: 'Could not verify the conversation.' }, 500);
  }
  if (!conversation) {
    return jsonResponse({ error: 'Conversation not found.' }, 404);
  }

  const { data: invitation, error: invitationError } = await adminClient
    .from('invitations')
    .select('sender_id, receiver_id, status')
    .eq('id', conversation.invitation_id)
    .maybeSingle();
  if (invitationError) {
    console.error('Invitation lookup failed:', invitationError.message);
    return jsonResponse({ error: 'Could not verify the invitation.' }, 500);
  }
  if (
    !invitation ||
    invitation.status !== 'accepted' ||
    ![invitation.sender_id, invitation.receiver_id].includes(user.id)
  ) {
    return jsonResponse(
      { error: 'Only participants in an accepted invitation can chat.' },
      403,
    );
  }

  const recipientId =
    invitation.sender_id === user.id
      ? invitation.receiver_id
      : invitation.sender_id;
  const { data: savedMessage, error: messageError } = await adminClient
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: messageBody,
    })
    .select('id, conversation_id, sender_id, body, created_at, read_at')
    .single();
  if (messageError) {
    console.error('Message insert failed:', messageError.message);
    return jsonResponse({ error: 'Could not save the message.' }, 500);
  }

  const warnings: string[] = [];
  const { error: notificationError } = await adminClient
    .from('notifications')
    .insert({
      user_id: recipientId,
      type: 'message',
      payload: {
        conversation_id: conversationId,
        message_id: savedMessage.id,
        sender_id: user.id,
      },
    });
  if (notificationError) {
    console.error('In-app notification insert failed:', notificationError.message);
    warnings.push('No se pudo crear la notificación interna.');
  }

  const { data: senderProfile, error: senderProfileError } = await adminClient
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  if (senderProfileError) {
    console.error('Sender profile lookup failed:', senderProfileError.message);
  }

  const { data: pushTokens, error: tokenError } = await adminClient
    .from('push_tokens')
    .select('token')
    .eq('user_id', recipientId);
  if (tokenError) {
    console.error('Push token lookup failed:', tokenError.message);
    warnings.push('No se pudieron consultar los dispositivos del destinatario.');
  }

  let sent = 0;
  let failed = 0;
  const tokens = (pushTokens ?? []).map((row) => row.token as string);
  if (tokens.length) {
    try {
      for (let offset = 0; offset < tokens.length; offset += 100) {
        const batch = tokens.slice(offset, offset + 100);
        const response = await fetch(
          'https://exp.host/--/api/v2/push/send',
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              batch.map((to) => ({
                to,
                title: senderProfile?.display_name ?? 'Nuevo mensaje',
                body:
                  messageBody.length > 140
                    ? `${messageBody.slice(0, 137)}...`
                    : messageBody,
                sound: 'default',
                channelId: 'messages',
                data: { screen: 'messages', conversationId },
              })),
            ),
          },
        );
        if (!response.ok) {
          throw new Error(`Expo Push Service returned HTTP ${response.status}.`);
        }
        const result = (await response.json()) as {
          data?: { status?: string }[] | { status?: string };
        };
        const tickets = Array.isArray(result.data)
          ? result.data
          : result.data
            ? [result.data]
            : [];
        sent += tickets.filter((ticket) => ticket.status === 'ok').length;
        failed += tickets.length - tickets.filter(
          (ticket) => ticket.status === 'ok',
        ).length;
      }
    } catch (pushError) {
      const details =
        pushError instanceof Error ? pushError.message : 'Unknown push error.';
      console.error('Push delivery failed:', details);
      warnings.push(`No se pudo enviar la notificación push: ${details}`);
      failed = Math.max(failed, tokens.length - sent);
    }
  }

  return jsonResponse({
    message: savedMessage,
    push: {
      targets: tokens.length,
      sent,
      failed,
      ...(warnings.length ? { error: warnings.join(' ') } : {}),
    },
    ...(notificationError
      ? { notificationError: 'No se pudo crear la notificación interna.' }
      : {}),
  });
});
