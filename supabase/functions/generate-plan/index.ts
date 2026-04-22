// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-opus-4-7';
const MAX_TOKENS    = 16000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_KEY') ?? '';
  if (!ANTHROPIC_KEY) {
    return json({ error: { message: 'ANTHROPIC_KEY secret not configured' } }, 500);
  }

  try {
    const { system, prompt } = await req.json();
    if (!prompt) return json({ error: { message: 'Missing prompt' } }, 400);

    const body = JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: false,
      system: system ?? '',
      messages: [{ role: 'user', content: prompt }],
    });

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body,
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Anthropic error:', JSON.stringify(data));
      return json({ error: data.error ?? { message: `HTTP ${res.status}` } }, res.status);
    }

    return json(data);
  } catch (err) {
    console.error('generate-plan error:', err);
    return json({ error: { message: String(err) } }, 500);
  }
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
