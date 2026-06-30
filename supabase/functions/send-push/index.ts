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
    const { employee_id, branch_id, title, body, url, badge_count } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    webPush.setVapidDetails(
      'mailto:b2b-product@mail.ru',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );

    let targetIds: string[] = [];

    if (branch_id) {
      const { data: employees } = await supabase
        .from('employees')
        .select('id')
        .eq('branch_id', branch_id)
        .eq('is_active', true);
      targetIds = employees?.map(e => e.id) ?? [];
    } else if (employee_id) {
      targetIds = [employee_id];
    }

    if (targetIds.length === 0) {
      return new Response(JSON.stringify({ message: 'No targets' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, subscription, employee_id')
      .in('employee_id', targetIds);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ message: 'No subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const staleIds: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          let recipientBadge = badge_count;
          if (recipientBadge === undefined) {
            const { data: unreadData } = await supabase
              .rpc('get_total_unread_for_employee', { p_employee_id: s.employee_id });
            recipientBadge = (unreadData ?? 0) + 1;
          }

          await webPush.sendNotification(
            s.subscription,
            JSON.stringify({ title, body, url: url || '/', badge_count: recipientBadge }),
          );
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            staleIds.push(s.id);
          } else {
            console.error('Push send error:', err.statusCode, err.message);
          }
        }
      }),
    );

    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    return new Response(JSON.stringify({ success: true, sent: subs.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
