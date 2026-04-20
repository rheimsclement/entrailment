// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const STRIPE_KEY    = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const PRICE_PDF     = Deno.env.get('STRIPE_PRICE_PDF_WATCH') ?? '';
  const PRICE_FULL    = Deno.env.get('STRIPE_PRICE_FULL') ?? '';
  const SITE_URL      = Deno.env.get('SITE_URL') ?? 'https://entrailment.com';
  const SUPABASE_URL  = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    // ── Auth — decode JWT without any Supabase SDK ────────────────────────────
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
    const payload = decodeJwt(token);
    if (!payload?.sub) return json({ error: 'Unauthorized' }, 401);

    const userId    = payload.sub;
    const userEmail = payload.email ?? '';

    // ── Payload ───────────────────────────────────────────────────────────────
    const { tier } = await req.json();
    const priceId = tier === 'pdf_watch' ? PRICE_PDF : tier === 'full' ? PRICE_FULL : null;
    if (!priceId) return json({ error: 'Invalid tier' }, 400);

    // ── Retrieve or create Stripe customer (direct REST, no SDK) ──────────────
    const rows = await dbGet(
      SUPABASE_URL, SERVICE_KEY,
      `user_subscriptions?user_id=eq.${userId}&select=stripe_customer_id&limit=1`
    );
    let customerId = rows[0]?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripeCall('POST', '/v1/customers', STRIPE_KEY, new URLSearchParams({
        email: userEmail,
        'metadata[supabase_uid]': userId,
      }));
      customerId = customer.id;
      await dbUpsert(SUPABASE_URL, SERVICE_KEY, 'user_subscriptions', {
        user_id: userId,
        stripe_customer_id: customerId,
        tier: 'free',
      });
    }

    // ── Create Checkout session ───────────────────────────────────────────────
    const params = new URLSearchParams({
      customer: customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      mode: tier === 'full' ? 'subscription' : 'payment',
      success_url: `${SITE_URL}/?payment=success&tier=${tier}`,
      cancel_url: `${SITE_URL}/?payment=cancel`,
      'metadata[supabase_uid]': userId,
      'metadata[tier]': tier,
    });
    if (tier === 'full') {
      params.set('subscription_data[metadata][supabase_uid]', userId);
      params.set('subscription_data[metadata][tier]', tier);
    }

    const session = await stripeCall('POST', '/v1/checkout/sessions', STRIPE_KEY, params);
    if (!session.url) {
      console.error('Stripe error:', JSON.stringify(session));
      return json({ error: session.error?.message ?? 'Stripe error' }, 500);
    }

    return json({ url: session.url });
  } catch (err) {
    console.error('Edge function error:', err);
    return json({ error: String(err) }, 500);
  }
});

// ── Supabase REST helpers (no SDK) ────────────────────────────────────────────

function dbHeaders(key) {
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function dbGet(url, key, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: dbHeaders(key) });
  return res.json();
}

async function dbUpsert(url, key, table, data) {
  await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...dbHeaders(key), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(data),
  });
}

// ── Stripe REST helper ────────────────────────────────────────────────────────

async function stripeCall(method, path, key, body) {
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

// ── JWT decode (no verification — trusted Edge Function environment) ──────────

function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── Response helper ───────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
