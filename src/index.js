const REPO_OWNER = "VJsTV";
const REPO_NAME = "website";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle API routes
    if (path.startsWith('/api/')) {
      if (path === '/api/report') return handleReport(request, env);
      if (path === '/api/submit') return handleSubmit(request, env);
      if (path === '/api/partner') return handlePartner(request, env);
      if (path === '/api/health') return handleHealth(request, env);
      if (path === '/api/analytics' && !path.includes('/charts')) return handleAnalytics(request, env);
      if (path.startsWith('/api/analytics/charts')) return handleCharts(request, env);
      
      // CORS preflight for API
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }
      
      return new Response('Not Found', { status: 404 });
    }

    // Serve static files from _site
    return serveStatic(path, env);
  }
};

async function handleReport(request, env) {
  if (request.method === "OPTIONS") {
    return corsResponse();
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const data = await request.json();
  const GITHUB_TOKEN = env.GITHUB_TOKEN;

  if (!GITHUB_TOKEN) {
    return jsonResponse({ success: false, error: "Server configuration error." }, 500);
  }

  try {
    const reporterName = (data.reporter_name || "").trim().slice(0, 100);
    const description = (data.description || "").trim().slice(0, 2000);
    const reporterEmail = (data.reporter_email || "").trim().slice(0, 200);

    if (!reporterName || !description) {
      return jsonResponse({ success: false, error: "Name and description are required." }, 400);
    }

    if (data.honeypot) {
      return jsonResponse({ success: true }, 200);
    }

    const projectTitle = (data.project_title || "Unknown Project").trim().slice(0, 200);
    const projectUrl = (data.project_url || "").trim().slice(0, 500);

    const issueTitle = `[Report] ${projectTitle} – ${reporterName}`;
    const issueBody = [
      "## Project Issue Report",
      "",
      `**Reporter:** ${reporterName}`,
      `**Email:** ${reporterEmail || "N/A"}`,
      `**Project:** [${projectTitle}](${projectUrl})`,
      "",
      "### Description",
      "",
      description,
      "",
      "---",
      "*Reported via vjstv.com project page*",
    ].join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const ghRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "VJsTV-CloudflareWorker",
        "Accept": "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ["report"],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const result = await ghRes.json();
    
    if (result.id) {
      return jsonResponse({ success: true, issue_number: result.number }, 200);
    } else {
      return jsonResponse({ success: true, issue_number: 0 }, 200);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: "Server error. Please try again later." }, 500);
  }
}

async function handleSubmit(request, env) {
  if (request.method === "OPTIONS") {
    return corsResponse();
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const data = await request.json();
  const GITHUB_TOKEN = env.GITHUB_TOKEN;

  if (!GITHUB_TOKEN) {
    return jsonResponse({ success: false, error: "Server configuration error." }, 500);
  }

  try {
    if (!data.artist || !data.project_title || !data.email || !data.video_url || !data.description || !data.category) {
      return jsonResponse({ success: false, error: "Missing required fields." }, 400);
    }

    try { new URL(data.video_url); } catch (e) {
      return jsonResponse({ success: false, error: "Invalid video URL." }, 400);
    }

    if (data.honeypot) {
      return jsonResponse({ success: true }, 200);
    }

    const vimeoId = extractVimeoId(data.video_url);
    const nameSlug = slugify(data.project_title + "-" + data.artist);
    const typeLabel = mapTypeToLabel(data.category);
    const issueTitle = `[${data.category}] ${data.project_title} – ${data.artist}`;

    const technologies = data.technology
      ? data.technology.split(",").map(t => t.trim()).filter(Boolean)
      : [];

    const frontMatter = [
      "---",
      'layout: vjs-detail',
      vimeoId ? `vimeo_id: "${vimeoId}"` : null,
      `title: "${data.project_title.replace(/"/g, '\\"')}"`,
      `name: "${nameSlug}"`,
      `artist: "${data.artist.replace(/"/g, '\\"')}"`,
      `project_type: "${data.category}"`,
      `location: "${(data.location || "").replace(/"/g, '\\"')}"`,
      `year: ${data.year || new Date().getFullYear()}`,
      `video_url: "${vimeoId ? 'https://player.vimeo.com/video/' + vimeoId : data.video_url}"`,
      `description: "${data.description.replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
      'featured: false',
      data.website ? `website: "${data.website}"` : null,
      data.studio ? `studio: "${data.studio}"` : null,
    ].filter(Boolean);

    if (technologies.length > 0) {
      frontMatter.push("technologies:");
      technologies.forEach(t => frontMatter.push(`  - "${t}"`));
    }

    const social = {};
    if (data.instagram) social.instagram = data.instagram;
    if (data.vimeo) social.vimeo = data.vimeo;
    if (Object.keys(social).length > 0) {
      frontMatter.push("social:");
      Object.keys(social).forEach(k => frontMatter.push(`  ${k}: "${social[k]}"`));
    }

    frontMatter.push("---");
    frontMatter.push("");
    frontMatter.push(`**${data.project_title.replace(/"/g, '')}** by **${data.artist.replace(/"/g, '')}** — ${data.description.replace(/\n/g, " ")}`);

    const issueBody = [
      "## Submission Details",
      "",
      `**Artist / Collective:** ${data.artist}`,
      `**Project Title:** ${data.project_title}`,
      `**Category:** ${data.category}`,
      `**Email:** ${data.email}`,
      `**Location:** ${data.location || "N/A"}`,
      `**Year:** ${data.year || "N/A"}`,
      `**Video Link:** ${data.video_url}`,
      vimeoId ? `**Vimeo ID:** ${vimeoId}` : null,
      "",
      "### Description",
      "",
      data.description,
      "",
      `**Technologies:** ${data.technology || "N/A"}`,
      `**Studio:** ${data.studio || "N/A"}`,
      `**Website:** ${data.website || "N/A"}`,
      `**Instagram:** ${data.instagram || "N/A"}`,
      `**Vimeo Profile:** ${data.vimeo || "N/A"}`,
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
      "*Submitted via vjstv.com submission form*",
    ].filter(Boolean).join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const ghRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "VJsTV-CloudflareWorker",
        "Accept": "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ["submission", typeLabel],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const result = await ghRes.json();

    if (result.id) {
      return jsonResponse({ success: true, issue_number: result.number, issue_url: result.html_url }, 200);
    } else {
      return jsonResponse({ success: false, error: "Failed to create submission. Please try again." }, 502);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: "Server error. Please try again later." }, 500);
  }
}

async function handlePartner(request, env) {
  if (request.method === "OPTIONS") {
    return corsResponse();
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const data = await request.json();
  const GITHUB_TOKEN = env.GITHUB_TOKEN;

  if (!GITHUB_TOKEN) {
    return jsonResponse({ success: false, error: "Server configuration error." }, 500);
  }

  try {
    const fullName = (data.full_name || "").trim().slice(0, 100);
    const company = (data.company || "").trim().slice(0, 200);
    const email = (data.email || "").trim().slice(0, 200);
    const tier = (data.tier || "").trim().slice(0, 100);
    const message = (data.message || "").trim().slice(0, 3000);

    if (!fullName || !email || !message) {
      return jsonResponse({ success: false, error: "Name, email, and message are required." }, 400);
    }

    if (data.website_url) {
      return jsonResponse({ success: true }, 200);
    }

    const issueTitle = `SPONSORS & PARTNERS – ${company || fullName}`;
    const issueBody = [
      "## Partnership Enquiry",
      "",
      `**Name:** ${fullName}`,
      `**Company:** ${company || "N/A"}`,
      `**Email:** ${email}`,
      `**Partnership Tier:** ${tier || "Not sure yet"}`,
      "",
      "### Brand & Goals",
      "",
      message,
      "",
      "---",
      "*Submitted via vjstv.com sponsors page*",
    ].join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const ghRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "VJsTV-CloudflareWorker",
        "Accept": "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ["partnership"],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const result = await ghRes.json();

    if (result.id) {
      return jsonResponse({ success: true, issue_number: result.number }, 200);
    } else {
      return jsonResponse({ success: false, error: "Failed to send enquiry. Please try again." }, 502);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: "Server error. Please try again later." }, 500);
  }
}

async function handleHealth(request, env) {
  if (request.method === "OPTIONS") {
    return corsResponse();
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  return jsonResponse({ status: "ok", timestamp: new Date().toISOString() }, 200);
}

async function handleAnalytics(request, env) {
  if (request.method === "OPTIONS") {
    return corsResponse();
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const CF_API_TOKEN = env.CF_API_TOKEN;
  const CF_ZONE_ID = env.CF_ZONE_ID;

  if (!CF_API_TOKEN || !CF_ZONE_ID) {
    return jsonResponse({ monthlyVisitors: 0, cached: false, error: "Analytics not configured" }, 200, { "Cache-Control": "public, max-age=600" });
  }

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const start = startDate.toISOString().split("T")[0];
    const end = now.toISOString().split("T")[0];

    const query = `{ viewer { zones(filter: { zoneTag: "${CF_ZONE_ID}" }) { httpRequests1dGroups(limit: 31, filter: { date_geq: "${start}", date_leq: "${end}" }) { sum { pageViews } } } } }`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const cfRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const cfData = await cfRes.json();

    if (cfData.errors && cfData.errors.length > 0) {
      return jsonResponse({ monthlyVisitors: 0, cached: false, error: cfData.errors[0].message }, 200);
    }

    const groups = (cfData.data?.viewer?.zones?.[0]?.httpRequests1dGroups) || [];
    let monthlyVisitors = 0;
    for (let i = 0; i < groups.length; i++) {
      monthlyVisitors += (groups[i].sum?.pageViews) || 0;
    }

    return jsonResponse({ monthlyVisitors, cached: false }, 200, { "Cache-Control": "public, max-age=600" });
  } catch (err) {
    return jsonResponse({ monthlyVisitors: 0, cached: false, error: err.message }, 500);
  }
}

async function handleCharts(request, env) {
  if (request.method === "OPTIONS") {
    return corsResponse();
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const CF_API_TOKEN = env.CF_API_TOKEN;
  const CF_ZONE_ID = env.CF_ZONE_ID;

  if (!CF_API_TOKEN || !CF_ZONE_ID) {
    return jsonResponse({ error: "Analytics not configured", data: {} }, 200);
  }

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const start = startDate.toISOString().split("T")[0];
    const end = now.toISOString().split("T")[0];

    const query = `{ viewer { zones(filter: { zoneTag: "${CF_ZONE_ID}" }) { httpRequests1dGroups(limit: 31, filter: { date_geq: "${start}", date_leq: "${end}" }) { dimensions { date } sum { pageViews clientCountryMap { clientCountryName requests } } } } } }`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const cfRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const cfData = await cfRes.json();

    if (cfData.errors?.length > 0) {
      return jsonResponse({ error: cfData.errors[0].message, data: {} }, 200);
    }

    const groups = cfData.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
    const chartData = {};
    const countryStats = {};

    for (const group of groups) {
      const date = group.dimensions?.date;
      const pageViews = group.sum?.pageViews || 0;
      if (date) chartData[date] = pageViews;
      
      const countries = group.sum?.clientCountryMap || [];
      for (const country of countries) {
        const name = country.clientCountryName;
        const requests = country.requests || 0;
        countryStats[name] = (countryStats[name] || 0) + requests;
      }
    }

    return jsonResponse({ data: { daily: chartData, countries: countryStats } }, 200, { "Cache-Control": "public, max-age=600" });
  } catch (err) {
    return jsonResponse({ error: err.message, data: {} }, 500);
  }
}

async function serveStatic(path, env) {
  // Serve files from _site directory
  // For now, return 404 since we don't have static file serving logic
  // The actual static files will be served by Cloudflare's default behavior
  return new Response('Not Found', { status: 404 });
}

// Utility functions
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function extractVimeoId(url) {
  if (!url) return null;
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function mapTypeToLabel(category) {
  const map = {
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

function jsonResponse(data, status = 200, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders,
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function corsResponse() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
