const REPO_OWNER = "VJsTV";
const REPO_NAME = "website";

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

export async function onRequestPost(context) {
  const { request, env } = context;
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
    const data = await request.json();

    if (!data.artist || !data.project_title || !data.email || !data.video_url || !data.description || !data.category) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields." }), { status: 400, headers });
    }

    try { new URL(data.video_url); } catch (e) {
      return new Response(JSON.stringify({ success: false, error: "Invalid video URL." }), { status: 400, headers });
    }

    if (data.honeypot) {
      return new Response(JSON.stringify({ success: true }), { headers });
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
      'layout: vjs-detail',
      vimeoId ? 'vimeo_id: "' + vimeoId + '"' : null,
      'title: "' + data.project_title.replace(/"/g, '\\"') + '"',
      'name: "' + nameSlug + '"',
      'artist: "' + data.artist.replace(/"/g, '\\"') + '"',
      'project_type: "' + data.category + '"',
      'location: "' + (data.location || "").replace(/"/g, '\\"') + '"',
      'year: ' + (data.year || new Date().getFullYear()),
      'video_url: "' + (vimeoId ? 'https://player.vimeo.com/video/' + vimeoId : data.video_url) + '"',
      'description: "' + data.description.replace(/"/g, '\\"').replace(/\n/g, " ") + '"',
      'featured: false',
      data.website ? 'website: "' + data.website + '"' : null,
      data.studio ? 'studio: "' + data.studio + '"' : null,
    ].filter(Boolean);

    if (technologies.length > 0) {
      frontMatter.push("technologies:");
      technologies.forEach(function (t) { frontMatter.push('  - "' + t + '"'); });
    }

    var social = {};
    if (data.instagram) social.instagram = data.instagram;
    if (data.vimeo) social.vimeo = data.vimeo;
    if (Object.keys(social).length > 0) {
      frontMatter.push("social:");
      Object.keys(social).forEach(function (k) { frontMatter.push('  ' + k + ': "' + social[k] + '"'); });
    }

    frontMatter.push("---");
    frontMatter.push("");
    frontMatter.push("**" + data.project_title.replace(/"/g, '') + "** by **" + data.artist.replace(/"/g, '') + "** \u2014 " + data.description.replace(/\n/g, " "));

    var issueBody = [
      "## Submission Details", "",
      "**Artist / Collective:** " + data.artist,
      "**Project Title:** " + data.project_title,
      "**Category:** " + data.category,
      "**Email:** " + data.email,
      "**Location:** " + (data.location || "N/A"),
      "**Year:** " + (data.year || "N/A"),
      "**Video Link:** " + data.video_url,
      vimeoId ? "**Vimeo ID:** " + vimeoId : null,
      "", "### Description", "", data.description, "",
      "**Technologies:** " + (data.technology || "N/A"),
      "**Studio:** " + (data.studio || "N/A"),
      "**Website:** " + (data.website || "N/A"),
      "**Instagram:** " + (data.instagram || "N/A"),
      "**Vimeo Profile:** " + (data.vimeo || "N/A"),
      "", "---", "", "### Jekyll Front Matter (auto-generated)", "",
      "```yaml", frontMatter.join("\n"), "```",
      "", "---", "*Submitted via vjstv.com submission form*",
    ].filter(function (l) { return l !== null; });

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
        body: issueBody.join("\n"),
        labels: ["submission", typeLabel],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    var result = await ghRes.json();

    if (result.id) {
      return new Response(JSON.stringify({ success: true, issue_number: result.number, issue_url: result.html_url }), { headers });
    } else {
      return new Response(JSON.stringify({ success: false, error: "Failed to create submission. Please try again." }), { status: 502, headers });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: "Server error. Please try again later." }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
