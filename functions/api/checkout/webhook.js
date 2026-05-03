async function stripeVerify(body, sigHeader, secret) {
  const parts = sigHeader.split(',').reduce((acc, p) => {
    const [k, v] = p.split('=');
    acc[k] = v;
    return acc;
  }, {});
  const ts = parts['t'];
  const sig = parts['v1'];
  if (!ts || !sig) return false;

  const payload = `${ts}.${body}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const computed = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const hex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === sig;
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return new Response('not configured', { status: 503 });
  }

  const body = await request.text();
  const sigHeader = request.headers.get('stripe-signature') || '';

  const valid = await stripeVerify(body, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response('Invalid signature', { status: 400 });

  let event;
  try { event = JSON.parse(body); } catch { return new Response('Bad JSON', { status: 400 }); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const slug = session.metadata?.slug;
    const email = session.customer_details?.email;

    if (slug && email && env.SEB) {
      const downloadUrl = env.R2_DOWNLOAD_BASE
        ? `${env.R2_DOWNLOAD_BASE}/${slug}.zip`
        : `https://assets.vjstv.com/downloads/${slug}.zip`;

      const msg = [
        `From: VJs TV <noreply@vjstv.com>`,
        `To: ${email}`,
        `Subject: Your VJs TV download is ready`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=utf-8`,
        '',
        `Your purchase is confirmed. Download your pack here:`,
        '',
        downloadUrl,
        '',
        `This link is available immediately. Keep it safe — it is your personal download.`,
        '',
        `— VJs TV`,
      ].join('\r\n');

      try {
        await env.SEB.send({
          from: 'noreply@vjstv.com',
          to: email,
          rawMessage: btoa(msg),
        });
      } catch (e) {
        console.error('[Webhook] Email send failed:', e.message);
      }
    }
  }

  return new Response('ok', { status: 200 });
}
