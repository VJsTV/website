const REPO_OWNER = "VJsTV";
const REPO_NAME = "website";

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

    var reporterName = (data.reporter_name || "").trim().slice(0, 100);
    var description = (data.description || "").trim().slice(0, 2000);
    var reporterEmail = (data.reporter_email || "").trim().slice(0, 200);

    if (!reporterName || !description) {
      return new Response(JSON.stringify({ success: false, error: "Name and description are required." }), { status: 400, headers });
    }

    if (data.honeypot) {
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    var projectTitle = (data.project_title || "Unknown Project").trim().slice(0, 200);
    var projectUrl = (data.project_url || "").trim().slice(0, 500);

    var issueTitle = "[Report] " + projectTitle + " \u2013 " + reporterName;
    var issueBody = [
      "## Project Issue Report", "",
      "**Reporter:** " + reporterName,
      "**Email:** " + (reporterEmail || "N/A"),
      "**Project:** [" + projectTitle + "](" + projectUrl + ")",
      "", "### Description", "", description,
      "", "---", "*Reported via vjstv.com project page*",
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
        labels: ["report"],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    var result = await ghRes.json();

    if (result.id) {
      return new Response(JSON.stringify({ success: true, issue_number: result.number }), { headers });
    } else {
      return new Response(JSON.stringify({ success: true, issue_number: 0 }), { headers });
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
