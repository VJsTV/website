function stripHeaderInjection(value) {
  return String(value || "").replace(/[\r\n\u0000]+/g, " ").trim();
}

function buildMime(from, to, subject, html) {
  const safeFrom = stripHeaderInjection(from);
  const safeTo = stripHeaderInjection(to);
  const safeSubject = stripHeaderInjection(subject).slice(0, 200);
  const boundary = "----=_Part_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const encodedSubject = "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(safeSubject))) + "?=";
  return [
    "MIME-Version: 1.0",
    "From: " + safeFrom,
    "To: " + safeTo,
    "Subject: " + encodedSubject,
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    "",
    "--" + boundary,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    btoa(unescape(encodeURIComponent(html))),
    "",
    "--" + boundary + "--",
  ].join("\r\n");
}

export async function sendEmail(env, to, subject, html) {
  if (!env || !env.SEB) return null;
  const safeTo = stripHeaderInjection(to);
  if (!safeTo || safeTo.indexOf("@") === -1) return null;

  try {
    const { EmailMessage } = await import("cloudflare:email");
    const from = "noreply@vjstv.com";
    const raw = buildMime("VJs TV <" + from + ">", safeTo, subject, html);
    const msg = new EmailMessage(from, safeTo, raw);
    await env.SEB.send(msg);
    return true;
  } catch (err) {
    return null;
  }
}

export function emailTemplate(heading, body) {
  const safeHeading = String(heading || "").replace(/[<>]/g, "");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#050505;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:28px;font-weight:800;letter-spacing:2px;">
        <span style="color:#ff0044;">VJs</span>
        <span style="color:#ffffff;"> TV</span>
      </span>
    </div>
    <div style="background:#0a0a0a;border:1px solid #1a1a1a;padding:32px 24px;">
      <h1 style="color:#ffffff;font-size:20px;margin:0 0 16px 0;font-weight:700;">${safeHeading}</h1>
      <div style="color:#999999;font-size:14px;line-height:1.6;">
        ${body}
      </div>
    </div>
    <div style="text-align:center;margin-top:24px;color:#555555;font-size:11px;">
      <a href="https://vjstv.com" style="color:#ff0044;text-decoration:none;">vjstv.com</a>
      &nbsp;&mdash;&nbsp; Global Broadcast Network for VJ Culture
    </div>
  </div>
</body>
</html>`;
}

export { buildMime, stripHeaderInjection };
