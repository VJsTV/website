import { EmailMessage } from "cloudflare:email";

const REPO_OWNER = "VJsTV";
const REPO_NAME = "website";

var countryNames = {
  TR:"Turkey",US:"United States",FR:"France",SG:"Singapore",HR:"Croatia",DE:"Germany",
  GB:"United Kingdom",NL:"Netherlands",CA:"Canada",AU:"Australia",JP:"Japan",BR:"Brazil",
  IT:"Italy",ES:"Spain",MX:"Mexico",IN:"India",KR:"South Korea",SE:"Sweden",NO:"Norway",
  DK:"Denmark",FI:"Finland",BE:"Belgium",AT:"Austria",CH:"Switzerland",PT:"Portugal",
  PL:"Poland",CZ:"Czech Republic",RO:"Romania",HU:"Hungary",GR:"Greece",IE:"Ireland",
  RU:"Russia",CN:"China",TW:"Taiwan",TH:"Thailand",ID:"Indonesia",PH:"Philippines",
  VN:"Vietnam",MY:"Malaysia",NZ:"New Zealand",AR:"Argentina",CL:"Chile",CO:"Colombia",
  ZA:"South Africa",EG:"Egypt",NG:"Nigeria",KE:"Kenya",IL:"Israel",AE:"UAE",SA:"Saudi Arabia",
  UA:"Ukraine",SK:"Slovakia",BG:"Bulgaria",RS:"Serbia",LT:"Lithuania",LV:"Latvia",
  EE:"Estonia",IS:"Iceland",LU:"Luxembourg",MT:"Malta",CY:"Cyprus",SI:"Slovenia",
  BA:"Bosnia",ME:"Montenegro",MK:"North Macedonia",AL:"Albania",XK:"Kosovo",MD:"Moldova",
  GE:"Georgia",AM:"Armenia",AZ:"Azerbaijan",BY:"Belarus",KZ:"Kazakhstan",UZ:"Uzbekistan",
  PK:"Pakistan",BD:"Bangladesh",LK:"Sri Lanka",MM:"Myanmar",KH:"Cambodia",LA:"Laos",
  PE:"Peru",EC:"Ecuador",VE:"Venezuela",UY:"Uruguay",PY:"Paraguay",BO:"Bolivia",
  CR:"Costa Rica",PA:"Panama",GT:"Guatemala",HN:"Honduras",SV:"El Salvador",NI:"Nicaragua",
  DO:"Dominican Republic",CU:"Cuba",JM:"Jamaica",TT:"Trinidad and Tobago",PR:"Puerto Rico"
};

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function extractVimeoId(url) {
  if (!url) return null;
  var m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function mapTypeToLabel(category) {
  var map = {
    "vj-set": "vj-set",
    "projection-mapping": "projection-mapping",
    "generative-art": "generative-art",
    "music-video": "music-video",
    "live-visuals": "live-visuals",
    "installation": "installation",
    "ai-visuals": "ai-visuals",
  };
  return map[(category || "").toLowerCase().replace(/\s+/g, "-")] || "submission";
}

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

async function createIssue(env, title, body, labels) {
  return await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
    method: "POST",
    headers: {
      "Authorization": `token ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "VJsTV-CloudflareWorker",
      "Accept": "application/vnd.github.v3+json",
    },
    body: JSON.stringify({ title, body, labels }),
  });
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), { headers });
    }

    if (url.pathname === "/api/analytics" && request.method === "GET") {
      const analyticsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600",
      };

      if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) {
        return new Response(JSON.stringify({ monthlyVisitors: 0, cached: false, error: "Analytics not configured" }), { headers: analyticsHeaders });
      }

      try {
        var now = new Date();
        var startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        var start = startDate.toISOString().split("T")[0];
        var end = now.toISOString().split("T")[0];

        var query = '{ viewer { zones(filter: { zoneTag: "' + env.CF_ZONE_ID + '" }) { httpRequests1dGroups(limit: 31, filter: { date_geq: "' + start + '", date_leq: "' + end + '" }) { sum { pageViews } } } } }';

        var cfRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + env.CF_API_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: query }),
        });

        var cfData = await cfRes.json();

        if (cfData.errors && cfData.errors.length > 0) {
          return new Response(JSON.stringify({ monthlyVisitors: 0, cached: false, error: cfData.errors[0].message }), { headers: analyticsHeaders });
        }

        var groups = (cfData.data && cfData.data.viewer && cfData.data.viewer.zones && cfData.data.viewer.zones[0] && cfData.data.viewer.zones[0].httpRequests1dGroups) || [];
        var monthlyVisitors = 0;
        for (var i = 0; i < groups.length; i++) {
          monthlyVisitors += (groups[i].sum || {}).pageViews || 0;
        }

        return new Response(JSON.stringify({ monthlyVisitors: monthlyVisitors, cached: false }), { headers: analyticsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ monthlyVisitors: 0, cached: false, error: err.message }), { status: 500, headers: analyticsHeaders });
      }
    }

    if (url.pathname === "/api/analytics/charts" && request.method === "GET") {
      const chartsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600",
      };

      var emptyResult = { dailyData: [], topCountries: [], totalUniques: 0, maxUniques: 0, monthlyVisitors: 0 };

      if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) {
        return new Response(JSON.stringify(Object.assign({}, emptyResult, { error: "Analytics not configured" })), { headers: chartsHeaders });
      }

      try {
        var now = new Date();
        var startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        var start = startDate.toISOString().split("T")[0];
        var end = now.toISOString().split("T")[0];

        var query = '{ viewer { zones(filter: { zoneTag: "' + env.CF_ZONE_ID + '" }) { httpRequests1dGroups(limit: 31, filter: { date_geq: "' + start + '", date_leq: "' + end + '" }, orderBy: [date_ASC]) { dimensions { date } sum { pageViews requests countryMap { clientCountryName requests } } uniq { uniques } } } } }';

        var cfRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + env.CF_API_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: query }),
        });

        var cfData = await cfRes.json();

        if (cfData.errors && cfData.errors.length > 0) {
          return new Response(JSON.stringify(Object.assign({}, emptyResult, { error: cfData.errors[0].message })), { headers: chartsHeaders });
        }

        var groups = (cfData.data && cfData.data.viewer && cfData.data.viewer.zones && cfData.data.viewer.zones[0] && cfData.data.viewer.zones[0].httpRequests1dGroups) || [];

        var dailyData = [];
        var totalUniques = 0;
        var maxUniques = 0;
        var monthlyVisitors = 0;
        var countryTotals = {};

        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          var dims = g.dimensions || {};
          var sum = g.sum || {};
          var uniq = g.uniq || {};
          var dayUniques = uniq.uniques || 0;
          totalUniques += dayUniques;
          if (dayUniques > maxUniques) maxUniques = dayUniques;
          monthlyVisitors += sum.pageViews || 0;

          dailyData.push({ date: dims.date, uniques: dayUniques, pageViews: sum.pageViews || 0, requests: sum.requests || 0 });

          var cm = sum.countryMap || [];
          for (var j = 0; j < cm.length; j++) {
            var code = cm[j].clientCountryName;
            var reqs = cm[j].requests || 0;
            countryTotals[code] = (countryTotals[code] || 0) + reqs;
          }
        }

        var topCountries = Object.keys(countryTotals)
          .map(function(k) { return { country: k, countryName: countryNames[k] || k, requests: countryTotals[k] }; })
          .sort(function(a, b) { return b.requests - a.requests; })
          .slice(0, 10);

        return new Response(JSON.stringify({ dailyData: dailyData, topCountries: topCountries, totalUniques: totalUniques, maxUniques: maxUniques, monthlyVisitors: monthlyVisitors, cached: false }), { headers: chartsHeaders });
      } catch (err) {
        return new Response(JSON.stringify(Object.assign({}, emptyResult, { error: err.message })), { status: 500, headers: chartsHeaders });
      }
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
    }

    if (!env.GITHUB_TOKEN) {
      return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), { status: 500, headers });
    }

    try {
      const data = await readBody(request);

      if (url.pathname === "/api/submit") {
        if (!data.artist || !data.project_title || !data.email || !data.video_url || !data.description || !data.category) {
          return new Response(JSON.stringify({ success: false, error: "Missing required fields." }), { status: 400, headers });
        }

        try { new URL(data.video_url); } catch (e) {
          return new Response(JSON.stringify({ success: false, error: "Invalid video URL." }), { status: 400, headers });
        }

        if (data.honeypot) {
          return new Response(JSON.stringify({ success: true }), { headers });
        }

        const moderationText = [data.artist, data.project_title, data.description, data.technology || ""].join("\n");
        const moderation = await moderateContent(env, moderationText, "project");
        if (!moderation.approved) {
          return new Response(JSON.stringify({
            success: false,
            error: "Submission flagged by moderation: " + (moderation.reason || "Content policy violation."),
            moderated: true,
          }), { status: 422, headers });
        }

        var vimeoId = extractVimeoId(data.video_url);
        var nameSlug = slugify(data.project_title + "-" + data.artist);
        var typeLabel = mapTypeToLabel(data.category);
        var issueTitle = "[" + data.category + "] " + data.project_title + " \u2013 " + data.artist;

        var technologies = data.technology
          ? data.technology.split(",").map(function (t) { return t.trim(); }).filter(Boolean)
          : [];

        var frontMatter = [
          "---",
          "layout: vjs-detail",
          vimeoId ? 'vimeo_id: "' + vimeoId + '"' : null,
          'title: "' + data.project_title.replace(/"/g, '\\"') + '"',
          'name: "' + nameSlug + '"',
          'artist: "' + data.artist.replace(/"/g, '\\"') + '"',
          'project_type: "' + data.category + '"',
          'location: "' + (data.location || "").replace(/"/g, '\\"') + '"',
          "year: " + (data.year || new Date().getFullYear()),
          'video_url: "' + (vimeoId ? "https://player.vimeo.com/video/" + vimeoId : data.video_url) + '"',
          'description: "' + data.description.replace(/"/g, '\\"').replace(/\n/g, " ") + '"',
          "featured: false",
          data.website ? 'website: "' + data.website + '"' : null,
          data.studio ? 'studio: "' + data.studio + '"' : null,
        ].filter(Boolean);

        if (technologies.length > 0) {
          frontMatter.push("technologies:");
          technologies.forEach(function (t) {
            frontMatter.push('  - "' + t + '"');
          });
        }

        var social = {};
        if (data.instagram) social.instagram = data.instagram;
        if (data.vimeo) social.vimeo = data.vimeo;
        if (Object.keys(social).length > 0) {
          frontMatter.push("social:");
          Object.keys(social).forEach(function (k) {
            frontMatter.push("  " + k + ': "' + social[k] + '"');
          });
        }

        frontMatter.push("---");
        frontMatter.push("");
        frontMatter.push("**" + data.project_title.replace(/"/g, "") + "** by **" + data.artist.replace(/"/g, "") + "** \u2014 " + data.description.replace(/\n/g, " "));

        var moderationNote = moderation.confidence
          ? "\n\n> **AI Moderation:** Approved (confidence: " + (moderation.confidence * 100).toFixed(0) + "%)"
          : "";

        var issueBody = [
          "## Submission Details",
          "",
          "**Artist / Collective:** " + data.artist,
          "**Project Title:** " + data.project_title,
          "**Category:** " + data.category,
          "**Email:** " + data.email,
          "**Location:** " + (data.location || "N/A"),
          "**Year:** " + (data.year || "N/A"),
          "**Video Link:** " + data.video_url,
          vimeoId ? "**Vimeo ID:** " + vimeoId : null,
          "",
          "### Description",
          "",
          data.description,
          "",
          "**Technologies:** " + (data.technology || "N/A"),
          "**Studio:** " + (data.studio || "N/A"),
          "**Website:** " + (data.website || "N/A"),
          "**Instagram:** " + (data.instagram || "N/A"),
          "**Vimeo Profile:** " + (data.vimeo || "N/A"),
          "",
          "---",
          "",
          "### Jekyll Front Matter (auto-generated)",
          "",
          "```yaml",
          frontMatter.join("\n"),
          "```",
          "",
          "---",
          "*Submitted via vjstv.com submission form*" + moderationNote,
        ].filter(function (l) { return l !== null; });

        const ghRes = await createIssue(env, issueTitle, issueBody.join("\n"), ["submission", typeLabel]);
        const result = await ghRes.json();

        if (result.id) {
          await sendEmail(env, data.email,
            "Submission received \u2013 " + data.project_title,
            emailTemplate("Your project has been received", `
              <p style="color:#ffffff;margin:0 0 12px 0;">Hi <strong>${data.artist}</strong>,</p>
              <p>Thank you for submitting <strong style="color:#ffffff;">${data.project_title}</strong> to VJs TV.</p>
              <p>Our editorial team will review your submission and get back to you. Here are the details we received:</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Category</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">${data.category}</td></tr>
                <tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Video</td><td style="padding:6px 0;border-bottom:1px solid #1a1a1a;"><a href="${data.video_url}" style="color:#ff0044;">${data.video_url}</a></td></tr>
                ${data.location ? '<tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Location</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">' + data.location + '</td></tr>' : ''}
                ${data.technology ? '<tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Tech</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">' + data.technology + '</td></tr>' : ''}
              </table>
              <p style="color:#666;font-size:12px;">Tracking reference: #${result.number}</p>
            `)
          );
          return new Response(JSON.stringify({ success: true, issue_number: result.number, issue_url: result.html_url }), { headers });
        }
        return new Response(JSON.stringify({ success: false, error: "Failed to create submission. Please try again." }), { status: 502, headers });
      }

      if (url.pathname === "/api/report") {
        var reporterName = (data.reporter_name || "").trim().slice(0, 100);
        var description = (data.description || "").trim().slice(0, 2000);
        var reporterEmail = (data.reporter_email || "").trim().slice(0, 200);

        if (!reporterName || !description) {
          return new Response(JSON.stringify({ success: false, error: "Name and description are required." }), { status: 400, headers });
        }

        if (data.honeypot) {
          return new Response(JSON.stringify({ success: true }), { headers });
        }

        const moderation = await moderateContent(env, description, "issue report");
        if (!moderation.approved) {
          return new Response(JSON.stringify({
            success: false,
            error: "Report flagged by moderation: " + (moderation.reason || "Content policy violation."),
            moderated: true,
          }), { status: 422, headers });
        }

        var projectTitle = (data.project_title || "Unknown Project").trim().slice(0, 200);
        var projectUrl = (data.project_url || "").trim().slice(0, 500);
        var issueTitle = "[Report] " + projectTitle + " \u2013 " + reporterName;

        var moderationNote = moderation.confidence
          ? "\n\n> **AI Moderation:** Approved (confidence: " + (moderation.confidence * 100).toFixed(0) + "%)"
          : "";

        var issueBody = [
          "## Project Issue Report",
          "",
          "**Reporter:** " + reporterName,
          "**Email:** " + (reporterEmail || "N/A"),
          "**Project:** [" + projectTitle + "](" + projectUrl + ")",
          "",
          "### Description",
          "",
          description,
          "",
          "---",
          "*Reported via vjstv.com project page*" + moderationNote,
        ].join("\n");

        const ghRes = await createIssue(env, issueTitle, issueBody, ["report"]);
        const result = await ghRes.json();

        if (result.id && reporterEmail) {
          await sendEmail(env, reporterEmail,
            "Report received \u2013 " + projectTitle,
            emailTemplate("Your report has been received", `
              <p style="color:#ffffff;margin:0 0 12px 0;">Hi <strong>${reporterName}</strong>,</p>
              <p>Thank you for reporting an issue with <strong style="color:#ffffff;">${projectTitle}</strong>.</p>
              <p>Our team will investigate and take appropriate action.</p>
              <div style="background:#111;padding:16px;margin:16px 0;border-left:3px solid #ff0044;">
                <p style="color:#ccc;margin:0;font-size:13px;">${description.slice(0, 300)}${description.length > 300 ? '...' : ''}</p>
              </div>
              <p style="color:#666;font-size:12px;">Tracking reference: #${result.number}</p>
            `)
          );
        }

        if (result.id) {
          return new Response(JSON.stringify({ success: true, issue_number: result.number }), { headers });
        }
        return new Response(JSON.stringify({ success: true, issue_number: 0 }), { headers });
      }

      if (url.pathname === "/api/partner") {
        var fullName = (data.full_name || "").trim().slice(0, 100);
        var company = (data.company || "").trim().slice(0, 200);
        var email = (data.email || "").trim().slice(0, 200);
        var tier = (data.tier || "").trim().slice(0, 100);
        var message = (data.message || "").trim().slice(0, 3000);

        if (!fullName || !email || !message) {
          return new Response(JSON.stringify({ success: false, error: "Name, email, and message are required." }), { status: 400, headers });
        }

        if (data.website_url) {
          return new Response(JSON.stringify({ success: true }), { headers });
        }

        const moderation = await moderateContent(env, [fullName, company, message].join("\n"), "partnership enquiry");
        if (!moderation.approved) {
          return new Response(JSON.stringify({
            success: false,
            error: "Enquiry flagged by moderation: " + (moderation.reason || "Content policy violation."),
            moderated: true,
          }), { status: 422, headers });
        }

        var moderationNote = moderation.confidence
          ? "\n\n> **AI Moderation:** Approved (confidence: " + (moderation.confidence * 100).toFixed(0) + "%)"
          : "";

        var issueTitle = "SPONSORS & PARTNERS \u2013 " + (company || fullName);
        var issueBody = [
          "## Partnership Enquiry",
          "",
          "**Name:** " + fullName,
          "**Company:** " + (company || "N/A"),
          "**Email:** " + email,
          "**Partnership Tier:** " + (tier || "Not sure yet"),
          "",
          "### Brand & Goals",
          "",
          message,
          "",
          "---",
          "*Submitted via vjstv.com sponsors page*" + moderationNote,
        ].join("\n");

        const ghRes = await createIssue(env, issueTitle, issueBody, ["partnership"]);
        const result = await ghRes.json();

        if (result.id) {
          await sendEmail(env, email,
            "Partnership enquiry received \u2013 VJs TV",
            emailTemplate("Your enquiry has been received", `
              <p style="color:#ffffff;margin:0 0 12px 0;">Hi <strong>${fullName}</strong>,</p>
              <p>Thank you for your interest in partnering with VJs TV${company ? ' on behalf of <strong style="color:#ffffff;">' + company + '</strong>' : ''}.</p>
              <p>Our partnerships team will review your enquiry and respond within 48 hours.</p>
              ${tier ? '<table style="width:100%;border-collapse:collapse;margin:16px 0;"><tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Interest</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">' + tier + '</td></tr></table>' : ''}
              <div style="background:#111;padding:16px;margin:16px 0;border-left:3px solid #ff0044;">
                <p style="color:#ccc;margin:0;font-size:13px;">${message.slice(0, 400)}${message.length > 400 ? '...' : ''}</p>
              </div>
              <p style="color:#666;font-size:12px;">Tracking reference: #${result.number}</p>
            `)
          );
          return new Response(JSON.stringify({ success: true, issue_number: result.number }), { headers });
        }
        return new Response(JSON.stringify({ success: false, error: "Failed to send enquiry. Please try again." }), { status: 502, headers });
      }

      if (url.pathname === "/api/booking") {
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

        const ghRes = await createIssue(env, issueTitle, issueBody, [issueLabel]);
        const result = await ghRes.json();

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
        }
        return new Response(JSON.stringify({ success: false, error: "Failed to send enquiry. Please try again." }), { status: 502, headers });
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: "Server error. Please try again later." }), { status: 500, headers });
    }
  },
};
