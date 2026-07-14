// Superadmin user management Edge Function.
// Uses the service-role key (auto-injected) and is gated to the superadmin email.
// Deploy with: supabase functions deploy admin-users
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPERADMIN_EMAIL = 'rodionnrb@gmail.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server not configured' }, 500);
  }

  // 1. Identify the caller from their JWT and verify superadmin.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json({ error: 'Missing authorization' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: 'Invalid token' }, 401);
  }
  if ((userData.user.email ?? '').toLowerCase() !== SUPERADMIN_EMAIL) {
    return json({ error: 'Forbidden' }, 403);
  }

  // 2. Service-role client for privileged operations.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = String(body.action ?? '');

  try {
    if (action === 'list') {
      const { data: list, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (error) return json({ error: error.message }, 400);

      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email, role, password_plain');
      const byId = new Map(
        (profiles ?? []).map((p) => [p.id as string, p]),
      );

      const users = (list?.users ?? []).map((u) => {
        const p = byId.get(u.id);
        return {
          id: u.id,
          email: u.email ?? p?.email ?? '',
          role: p?.role ?? 'user',
          password: p?.password_plain ?? '',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        };
      });
      return json({ users });
    }

    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!email || !password) {
        return json({ error: 'Email и пароль обязательны' }, 400);
      }
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) return json({ error: error.message }, 400);

      const newId = created?.user?.id;
      if (newId) {
        await admin
          .from('profiles')
          .upsert(
            {
              id: newId,
              email,
              password_plain: password,
              role: email === SUPERADMIN_EMAIL ? 'superadmin' : 'user',
            },
            { onConflict: 'id' },
          );
      }
      return json({ ok: true, id: newId });
    }

    if (action === 'set_password') {
      const id = String(body.id ?? '');
      const password = String(body.password ?? '');
      if (!id) return json({ error: 'Не указан id' }, 400);
      if (!password || password.length < 6) {
        return json({ error: 'Пароль должен быть не короче 6 символов' }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      await admin
        .from('profiles')
        .upsert({ id, password_plain: password }, { onConflict: 'id' });
      return json({ ok: true });
    }

    if (action === 'delete') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'Не указан id' }, 400);
      if (id === userData.user.id) {
        return json({ error: 'Нельзя удалить самого себя' }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
