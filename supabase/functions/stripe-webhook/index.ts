// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature') ?? '';
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  // ── Verify signature ──────────────────────────────────────────────────────
  const valid = await verifyStripeSignature(body, sig, secret);
  if (!valid) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const uid  = session.metadata?.supabase_uid;
        const tier = session.metadata?.tier;
        if (!uid || !tier) break;

        const update = {
          user_id: uid,
          tier,
          stripe_customer_id: session.customer,
          status: 'active',
        };

        if (session.mode === 'subscription' && session.subscription) {
          update.stripe_subscription_id = session.subscription;
          // Fetch subscription for period end
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
            headers: { 'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}` },
          });
          const sub = await subRes.json();
          update.current_period_end = new Date(sub.current_period_end * 1000).toISOString();
        }

        await supabase.from('user_subscriptions').upsert(update, { onConflict: 'user_id' });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const uid = sub.metadata?.supabase_uid;
        if (!uid) break;
        await supabase.from('user_subscriptions').update({
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        }).eq('user_id', uid);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const uid = sub.metadata?.supabase_uid;
        if (!uid) break;
        await supabase.from('user_subscriptions').update({
          tier: 'free',
          status: 'canceled',
          stripe_subscription_id: null,
          current_period_end: null,
        }).eq('user_id', uid);
        break;
      }
    }
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// ── Stripe signature verification (Web Crypto) ────────────────────────────────

async function verifyStripeSignature(body, sig, secret) {
  try {
    let timestamp = '';
    let signature = '';
    for (const part of sig.split(',')) {
      const [k, v] = part.split('=');
      if (k === 't') timestamp = v;
      if (k === 'v1') signature = v;
    }
    if (!timestamp || !signature) return false;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`));
    const expected = Array.from(new Uint8Array(mac))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    return expected === signature;
  } catch {
    return false;
  }
}
