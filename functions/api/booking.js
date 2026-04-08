const REPO_OWNER = "VJsTV";
const REPO_NAME = "website";

async function readBody(request) {
  var contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return await request.json();
  var formData = await request.formData();
  return Object.fromEntries(formData.entries());
}

async function moderateContent(env, text, context) {
  if (!env.AI) return { approved: true, reason: null, confidence: null };

  try {
    const prompt = `You are a content moderator for VJsTV, a platform about VJ culture, visual performance art, projection mapping, generative art, and live visuals.

Evaluate this ${context} submission for:
1. Spam or promotional content unrelated to VJ/visual arts
2. Offensive, hateful, or inappropriate language
3. Phishing links or suspicious URLs
4. Gibberish or bot-generated nonsense

Content to evaluate:
"""
${text.slice(0, 1500)}
"""

Respond with ONLY valid JSON, no other text:
{"approved": true/false, "reason": "brief explanation if rejected, null if approved", "confidence": 0.0-1.0}`;

    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      prompt: prompt,
      max_tokens: 150,
      temperature: 0.1,
    });

    const raw = (response.response || "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        approved: result.approved !== false,
        reason: result.reason || null,
        confidence: result.confidence || 0.5,
      };
    }
    return { approved: true, reason: null, confidence: null };
  } catch (err) {
    return { approved: true, reason: null, confidence: null };
  }
}

function buildMime(from, to, subject, html) {
  const boundary = "----=_Part_" + Date.now().toString(36);
  const encodedSubject = "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(subject))) + "?=";
  return [
    "MIME-Version: 1.0",
    "From: " + from,
    "To: " + to,
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

async function sendEmail(env, to, subject, html) {
  if (!env.SEB) return null;
  try {
    const { EmailMessage } = await import("cloudflare:email");
    const from = "noreply@vjstv.com";
    const raw = buildMime("VJs TV <" + from + ">", to, subject, html);
    const msg = new EmailMessage(from, to, raw);
    await env.SEB.send(msg);
    return true;
  } catch (err) {
    return null;
  }
}

function emailTemplate(heading, body) {
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
      <h1 style="color:#ffffff;font-size:20px;margin:0 0 16px 0;font-weight:700;">${heading}</h1>
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

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const GITHUB_TOKEN = env.GITHUB_TOKEN;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (!GITHUB_TOKEN) {
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), { status: 500, headers });
  }

  try {
    const data = await readBody(request);

    var subject = (data.subject || "").trim().slice(0, 200);
    var profileType = (data.profile_type || "artist").trim().slice(0, 50);
    var serviceType = (data.service_type || "").trim().slice(0, 100);
    var eventName = (data.event_name || "").trim().slice(0, 200);
    var eventDate = (data.event_date || "").trim().slice(0, 100);
    var location = (data.location || "").trim().slice(0, 200);
    var budget = (data.budget || "").trim().slice(0, 100);
    var description = (data.description || "").trim().slice(0, 3000);
    var contactName = (data.contact_name || "").trim().slice(0, 100);
    var contactEmail = (data.contact_email || "").trim().slice(0, 200);
    var organisation = (data.organisation || "").trim().slice(0, 200);

    if (!serviceType || !eventName || !eventDate || !contactName || !contactEmail) {
      return new Response(JSON.stringify({ success: false, error: "Please fill in all required fields (service type, event name, date, name, and email)." }), { status: 400, headers });
    }

    if (data.honeypot || data.website_url) {
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    var moderationText = [subject, serviceType, eventName, description, contactName, organisation].join("\n");
    var moderation = await moderateContent(env, moderationText, "booking/enquiry");
    if (!moderation.approved) {
      return new Response(JSON.stringify({
        success: false,
        error: "Enquiry flagged by moderation: " + (moderation.reason || "Content policy violation."),
        moderated: true,
      }), { status: 422, headers });
    }

    var labelMap = {
      "artist": "booking",
      "studio": "studio-enquiry",
      "project": "commission",
    };
    var issueLabel = labelMap[profileType] || "booking";

    var eyebrowMap = {
      "artist": "BOOKING REQUEST",
      "studio": "STUDIO ENQUIRY",
      "project": "COMMISSION REQUEST",
    };
    var eyebrow = eyebrowMap[profileType] || "BOOKING REQUEST";

    var issueTitle = "[" + eyebrow + "] " + (subject || eventName) + " \u2013 " + contactName;

    var moderationNote = moderation.confidence
      ? "\n\n> **AI Moderation:** Approved (confidence: " + (moderation.confidence * 100).toFixed(0) + "%)"
      : "";

    var issueBody = [
      "## " + eyebrow,
      "",
      "**" + (profileType === "studio" ? "Studio" : profileType === "project" ? "Project" : "Artist") + ":** " + (subject || "N/A"),
      "**Service Type:** " + serviceType,
      "**Event / Project:** " + eventName,
      "**Date / Timeframe:** " + eventDate,
      "**Location:** " + (location || "N/A"),
      "**Budget Range:** " + (budget || "N/A"),
      "",
      "### Project Description",
      "",
      description || "_No description provided._",
      "",
      "---",
      "",
      "### Booker Details",
      "",
      "**Name:** " + contactName,
      "**Email:** " + contactEmail,
      "**Organisation:** " + (organisation || "N/A"),
      "",
      "---",
      "*Submitted via vjstv.com " + (profileType === "studio" ? "studio" : profileType === "project" ? "project" : "artist") + " page*" + moderationNote,
    ].join("\n");

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 10000);

    var ghRes = await fetch("https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues", {
      method: "POST",
      headers: {
        "Authorization": "token " + GITHUB_TOKEN,
        "Content-Type": "application/json",
        "User-Agent": "VJsTV-CloudflareWorker",
        "Accept": "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: [issueLabel],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    var result = await ghRes.json();

    if (result.id) {
      var serviceLabel = serviceType;
      var profileLabel = profileType === "studio" ? "studio" : profileType === "project" ? "project" : "artist";

      await sendEmail(env, contactEmail,
        eyebrow.charAt(0) + eyebrow.slice(1).toLowerCase() + " received \u2013 " + (subject || eventName),
        emailTemplate("Your enquiry has been received", `
          <p style="color:#ffffff;margin:0 0 12px 0;">Hi <strong>${contactName}</strong>,</p>
          <p>Thank you for your ${profileLabel === "studio" ? "studio enquiry" : profileLabel === "project" ? "commission request" : "booking request"} for <strong style="color:#ffffff;">${subject || eventName}</strong>.</p>
          <p>Our team will review your enquiry and get back to you shortly.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Service</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">${serviceLabel}</td></tr>
            <tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Event</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">${eventName}</td></tr>
            <tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Date</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">${eventDate}</td></tr>
            ${location ? '<tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Location</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">' + location + '</td></tr>' : ''}
            ${budget ? '<tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Budget</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">' + budget + '</td></tr>' : ''}
          </table>
          ${description ? '<div style="background:#111;padding:16px;margin:16px 0;border-left:3px solid #ff0044;"><p style="color:#ccc;margin:0;font-size:13px;">' + description.slice(0, 400) + (description.length > 400 ? '...' : '') + '</p></div>' : ''}
          <p style="color:#666;font-size:12px;">Tracking reference: #${result.number}</p>
        `)
      );

      return new Response(JSON.stringify({ success: true, issue_number: result.number }), { headers });
    } else {
      return new Response(JSON.stringify({ success: false, error: "Failed to send enquiry. Please try again." }), { status: 502, headers });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: "Server error. Please try again later." }), { status: 500, headers });
  }
}
