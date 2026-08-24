import { previewAllowed } from '../../_lib/cors.js';

const PACK_PRICES = {
  'vjstv-loops-01': { amount: 0, name: 'VJs TV Loops 01', currency: 'usd' },
};

const CORS = origin => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
});

export async function handleOptions(request) {
  const origin = request.headers.get('Origin') || '*';
  return new Response(null, { status: 204, headers: { ...CORS(origin), 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
}

export async function handlePost(request, env) {
  const origin = request.headers.get('Origin') || '';
  const isPreview = previewAllowed(env);
  const allowed = ['https://vjstv.com', 'https://www.vjstv.com'];
  if (!isPreview && !allowed.includes(origin)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: CORS(origin) });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: CORS(origin) });
  }

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: CORS(origin) }); }

  const { slug, email, success_url, cancel_url } = body;
  if (!slug || !PACK_PRICES[slug]) {
    return new Response(JSON.stringify({ error: 'unknown_pack' }), { status: 400, headers: CORS(origin) });
  }

  const pack = PACK_PRICES[slug];
  if (pack.amount === 0) {
    return new Response(JSON.stringify({ error: 'free_pack_use_lead_magnet' }), { status: 400, headers: CORS(origin) });
  }

  const siteOrigin = env.SITE_ORIGIN || 'https://vjstv.com';
  const params = new URLSearchParams({
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': pack.currency,
    'line_items[0][price_data][unit_amount]': String(pack.amount),
    'line_items[0][price_data][product_data][name]': pack.name,
    'line_items[0][mode]': 'payment',
    'success_url': success_url || `${siteOrigin}/thank-you/download/?source=stripe&slug=${slug}&session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url': cancel_url || `${siteOrigin}/loop-packs/${slug}/`,
    'metadata[slug]': slug,
  });
  if (email) params.set('customer_email', email);

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const session = await resp.json();
  if (!resp.ok) {
    console.error('[Checkout] Stripe error:', session.error?.message);
    return new Response(JSON.stringify({ error: 'stripe_error', detail: session.error?.message }), { status: 502, headers: CORS(origin) });
  }

  return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: CORS(origin) });
}
