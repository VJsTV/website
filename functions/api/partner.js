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

    var issueTitle = "SPONSORS & PARTNERS \u2013 " + (company || fullName);
    var issueBody = [
      "## Partnership Enquiry", "",
      "**Name:** " + fullName,
      "**Company:** " + (company || "N/A"),
      "**Email:** " + email,
      "**Partnership Tier:** " + (tier || "Not sure yet"),
      "", "### Brand & Goals", "", message,
      "", "---", "*Submitted via vjstv.com sponsors page*",
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
        labels: ["partnership"],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    var result = await ghRes.json();

    if (result.id) {
      return new Response(JSON.stringify({ success: true, issue_number: result.number }), { headers });
    } else {
      return new Response(JSON.stringify({ success: false, error: "Failed to send enquiry. Please try again." }), { status: 502, headers });
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
