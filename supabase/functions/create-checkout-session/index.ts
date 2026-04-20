// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

/**
 * POST /functions/v1/create-checkout-session
 * Body: { tier: 'pdf_watch' | 'full' }
 *
 * Creates a Stripe Checkout session and returns the URL.
 * - pdf_watch → one-time payment, 2 €
 * - full      → monthly subscription, 8 €/month
 */

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const PRICE_IDS: Record<string, string> = {
  pdf_watch: Deno.env.get('STRIPE_PRICE_PDF_WATCH')!,  // one-time 2 €
  full:      Deno.env.get('STRIPE_PRICE_FULL')!,        // subscription 8 €/mo
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Payload ───────────────────────────────────────────────────────────────
    const { tier } = await req.json() as { tier: string };
    const priceId = PRICE_IDS[tier];
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Invalid tier' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Retrieve or create Stripe customer ────────────────────────────────────
    const { data: sub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    let customerId: string | undefined = sub?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_uid: user.id },
      });
      customerId = customer.id;

      // Persist immediately so retries don't create duplicate customers
      await supabaseAdmin
        .from('user_subscriptions')
        .upsert({ user_id: user.id, stripe_customer_id: customerId, tier: 'free' }, { onConflict: 'user_id' });
    }

    // ── Create Checkout session ───────────────────────────────────────────────
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://entrailment.com';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: tier === 'full' ? 'subscription' : 'payment',
      success_url: `${siteUrl}/?payment=success&tier=${tier}`,
      cancel_url:  `${siteUrl}/?payment=cancel`,
      metadata: { supabase_uid: user.id, tier },
      ...(tier === 'full' && {
        subscription_data: { metadata: { supabase_uid: user.id, tier } },
      }),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
