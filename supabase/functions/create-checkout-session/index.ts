// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const PRICE_PDF  = Deno.env.get('STRIPE_PRICE_PDF_WATCH') ?? '';
  const PRICE_FULL = Deno.env.get('STRIPE_PRICE_FULL') ?? '';
  const SITE_URL   = Deno.env.get('SITE_URL') ?? 'https://entrailment.com';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // ── Payload ───────────────────────────────────────────────────────────────
    const { tier } = await req.json();
    const priceId = tier === 'pdf_watch' ? PRICE_PDF : tier === 'full' ? PRICE_FULL : null;
    if (!priceId) return json({ error: 'Invalid tier' }, 400);

    // ── Retrieve or create Stripe customer ────────────────────────────────────
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      const cRes = await stripe('POST', '/v1/customers', STRIPE_KEY, new URLSearchParams({
        email: user.email ?? '',
        'metadata[supabase_uid]': user.id,
      }));
      customerId = cRes.id;
      await supabase.from('user_subscriptions').upsert(
        { user_id: user.id, stripe_customer_id: customerId, tier: 'free' },
        { onConflict: 'user_id' }
      );
    }

    // ── Create Checkout session ───────────────────────────────────────────────
    const params = new URLSearchParams({
      customer: customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      mode: tier === 'full' ? 'subscription' : 'payment',
      success_url: `${SITE_URL}/?payment=success&tier=${tier}`,
      cancel_url: `${SITE_URL}/?payment=cancel`,
      'metadata[supabase_uid]': user.id,
      'metadata[tier]': tier,
    });

    if (tier === 'full') {
      params.set('subscription_data[metadata][supabase_uid]', user.id);
      params.set('subscription_data[metadata][tier]', tier);
    }

    const session = await stripe('POST', '/v1/checkout/sessions', STRIPE_KEY, params);

    if (!session.url) {
      console.error('Stripe error:', JSON.stringify(session));
      return json({ error: session.error?.message ?? 'Stripe error' }, 500);
    }

    return json({ url: session.url });
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function stripe(method, path, key, body) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  return res.json();
}
