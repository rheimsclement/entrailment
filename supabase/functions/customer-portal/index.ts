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
  const SITE_URL   = Deno.env.get('SITE_URL') ?? 'https://entrailment.com';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // ── Look up Stripe customer ───────────────────────────────────────────────
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    const customerId = sub?.stripe_customer_id;
    if (!customerId) return json({ error: 'No Stripe customer found' }, 404);

    // ── Create portal session ─────────────────────────────────────────────────
    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId,
        return_url: SITE_URL,
      }),
    });
    const portal = await res.json();

    if (!portal.url) {
      console.error('Portal error:', JSON.stringify(portal));
      return json({ error: portal.error?.message ?? 'Stripe error' }, 500);
    }

    return json({ url: portal.url });
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
