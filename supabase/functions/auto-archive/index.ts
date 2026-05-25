import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Проверяем что запрос аутентифицирован
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Парсим параметры из тела запроса (с дефолтами)
    let archiveClosed = true;
    let archiveInactive = true;
    try {
      const body = await req.json();
      if (typeof body.archiveClosed === 'boolean') archiveClosed = body.archiveClosed;
      if (typeof body.archiveInactive === 'boolean') archiveInactive = body.archiveInactive;
    } catch {
      // тело может быть пустым — используем дефолты
    }

    // Клиент с service_role — обходит RLS, только на сервере
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Вызываем SQL-функцию архивации
    const { data, error } = await supabase.rpc('auto_archive_chats', {
      p_archive_closed: archiveClosed,
      p_archive_inactive: archiveInactive,
    });

    if (error) throw error;

    console.log('[auto-archive] Result:', data);

    return new Response(
      JSON.stringify({ success: true, result: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[auto-archive] Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
