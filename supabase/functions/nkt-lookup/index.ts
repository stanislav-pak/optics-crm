const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { gtin } = await req.json();

    if (!gtin || !/^\d{13,14}$/.test(String(gtin).trim())) {
      return new Response(
        JSON.stringify({ error: 'Некорректный штрихкод — должно быть 13 или 14 цифр' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apiKey = Deno.env.get('NKT_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'NKT_API_KEY не настроен' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const res = await fetch(
      `https://nationalcatalog.kz/gwp/portal/api/v2/products/${gtin.trim()}`,
      { headers: { 'X-API-KEY': apiKey } },
    );

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
