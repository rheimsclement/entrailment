// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@13';

/**
 * POST /functions/v1/stripe-webhook
 *
 * Handles Stripe webhook events and keeps user_subscriptions in sync.
 *
 * Events handled:
 *   checkout.session.completed      → activate pdf_watch or full tier
 *   customer.subscription.updated  → sync subscription status / tier
 *   customer.subscription.deleted  → downgrade to free
 */

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

Deno.serve(async (req) => {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {

      // ── One-time purchase OR subscription checkout completed ───────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid     = session.metadata?.supabase_uid;
        const tier    = session.metadata?.tier as 'pdf_watch' | 'full';

        if (!uid || !tier) break;

        const update: Record<string, unknown> = {
          user_id: uid,
          tier,
          stripe_customer_id: session.customer as string,
          status: 'active',
        };

        if (session.mode === 'subscription') {
          update.stripe_subscription_id = session.subscription as string;
          // Fetch subscription to get current_period_end
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          update.current_period_end = new Date(sub.current_period_end * 1000).toISOString();
        }

        await supabaseAdmin
          .from('user_subscriptions')
          .upsert(update, { onConflict: 'user_id' });

        break;
      }

      // ── Subscription updated (renewal, plan change, status change) ─────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const uid = sub.metadata?.supabase_uid;
        if (!uid) break;

        await supabaseAdmin
          .from('user_subscriptions')
          .update({
            status: sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          })
          .eq('user_id', uid);

        break;
      }

      // ── Subscription canceled / expired ────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const uid = sub.metadata?.supabase_uid;
        if (!uid) break;

        await supabaseAdmin
          .from('user_subscriptions')
          .update({
            tier: 'free',
            status: 'canceled',
            stripe_subscription_id: null,
            current_period_end: null,
          })
          .eq('user_id', uid);

        break;
      }

      default:
        // Silently ignore other events
        break;
    }
  } catch (err) {
    console.error('Error processing webhook event', event.type, err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
