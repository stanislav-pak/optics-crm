import webPush from 'npm:web-push@3.6.7';
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
    const { employee_id, title, body } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('employee_id', employee_id);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ message: 'No subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    webPush.setVapidDetails(
      'mailto:b2b-product@mail.ru',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );

    const staleIds: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webPush.sendNotification(
            s.subscription,
            JSON.stringify({ title, body }),
          );
        } catch (err: any) {
          // 410 Gone or 404 = subscription expired/invalid, remove it
          if (err.statusCode === 410 || err.statusCode === 404) {
            staleIds.push(s.id);
          } else {
            console.error('Push send error:', err.message);
          }
        }
      }),
    );

    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
