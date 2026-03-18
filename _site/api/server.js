const express = require("express");
const cors = require("cors");
const { ReplitConnectors } = require("@replit/connectors-sdk");

const app = express();
const PORT = 3001;
const REPO_OWNER = "VJsTV";
const REPO_NAME = "website";

var allowedOrigins = [
  "http://localhost:5000",
  "https://vjstv.com",
  "https://www.vjstv.com",
];
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOrigins.push("https://" + process.env.REPLIT_DEV_DOMAIN);
}
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.some(function (o) { return origin.startsWith(o) || origin === o; })) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  }
}));
app.use(express.json({ limit: "50kb" }));

var rateLimitMap = {};
function rateLimit(windowMs, maxRequests) {
  return function (req, res, next) {
    var ip = req.ip || req.connection.remoteAddress || "unknown";
    var now = Date.now();
    if (!rateLimitMap[ip]) rateLimitMap[ip] = [];
    rateLimitMap[ip] = rateLimitMap[ip].filter(function (t) { return t > now - windowMs; });
    if (rateLimitMap[ip].length >= maxRequests) {
      return res.status(429).json({ success: false, error: "Too many requests. Please wait a moment." });
    }
    rateLimitMap[ip].push(now);
    next();
  };
}
setInterval(function () {
  var now = Date.now();
  Object.keys(rateLimitMap).forEach(function (ip) {
    rateLimitMap[ip] = rateLimitMap[ip].filter(function (t) { return t > now - 600000; });
    if (rateLimitMap[ip].length === 0) delete rateLimitMap[ip];
  });
}, 600000);

function extractVimeoId(url) {
  if (!url) return null;
  var m = url.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mapTypeToLabel(type) {
  var map = {
    "Live Visuals": "vj-set",
    "Projection Mapping": "projection-mapping",
    "AI & Generative": "ai-generative",
    "Immersive Installation": "immersive-installation",
    "Stage Production": "stage-production",
    "Experimental": "experimental",
    "Dome Visuals": "dome-visuals",
  };
  return map[type] || "submission";
}

app.post("/api/submit", rateLimit(300000, 3), async (req, res) => {
  try {
    var data = req.body;

    if (!data.artist || !data.project_title || !data.email || !data.video_url || !data.description || !data.category) {
      return res.status(400).json({ success: false, error: "Missing required fields." });
    }

    try {
      new URL(data.video_url);
    } catch (e) {
      return res.status(400).json({ success: false, error: "Invalid video URL." });
    }

    if (data.honeypot) {
      return res.json({ success: true });
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
      'title: "' + data.project_title.replace(/"/g, '\\"') + '"',
      'name: "' + nameSlug + '"',
      'artist: "' + data.artist.replace(/"/g, '\\"') + '"',
      'project_type: "' + data.category + '"',
      'location: "' + (data.location || "").replace(/"/g, '\\"') + '"',
      'year: ' + (data.year || new Date().getFullYear()),
      'video_url: "' + data.video_url + '"',
      vimeoId ? 'vimeo_id: "' + vimeoId + '"' : null,
      'description: "' + data.description.replace(/"/g, '\\"').replace(/\n/g, " ") + '"',
      'featured: false',
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
        frontMatter.push('  ' + k + ': "' + social[k] + '"');
      });
    }

    frontMatter.push("---");

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
      "*Submitted via vjstv.com submission form*",
    ].filter(function (l) { return l !== null; });

    var labels = ["submission", typeLabel];

    var connectors = new ReplitConnectors();
    var response = await connectors.proxy("github", "/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody.join("\n"),
        labels: labels,
      }),
    });

    var result = await response.json();

    if (result.id) {
      console.log("Issue created: #" + result.number + " - " + issueTitle);
      return res.json({ success: true, issue_number: result.number, issue_url: result.html_url });
    } else {
      console.error("GitHub API error:", JSON.stringify(result));
      return res.status(502).json({ success: false, error: "Failed to create submission. Please try again." });
    }
  } catch (err) {
    console.error("Server error:", err.message);
    return res.status(500).json({ success: false, error: "Server error. Please try again later." });
  }
});

app.get("/api/projects", async (req, res) => {
  try {
    var connectors = new ReplitConnectors();
    var response = await connectors.proxy("github", "/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues?labels=approved&state=all&per_page=100", {
      method: "GET",
    });

    var issues = await response.json();

    if (!Array.isArray(issues)) {
      return res.status(502).json({ success: false, error: "Failed to fetch projects." });
    }

    var projects = issues.map(function (issue) {
      return {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        labels: issue.labels.map(function (l) { return l.name; }),
        created_at: issue.created_at,
        url: issue.html_url,
      };
    });

    return res.json({ success: true, projects: projects });
  } catch (err) {
    console.error("Fetch projects error:", err.message);
    return res.status(500).json({ success: false, error: "Server error." });
  }
});

app.post("/api/report", rateLimit(120000, 3), async (req, res) => {
  try {
    var data = req.body;

    var reporterName = (data.reporter_name || "").trim().slice(0, 100);
    var description = (data.description || "").trim().slice(0, 2000);
    var reporterEmail = (data.reporter_email || "").trim().slice(0, 200);

    if (!reporterName || !description) {
      return res.status(400).json({ success: false, error: "Name and description are required." });
    }

    if (data.honeypot) {
      return res.json({ success: true });
    }

    var projectTitle = (data.project_title || "Unknown Project").trim().slice(0, 200);
    var projectUrl = (data.project_url || "").trim().slice(0, 500);

    var issueTitle = "[Report] " + projectTitle + " \u2013 " + reporterName;

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
      "*Reported via vjstv.com project page*",
    ].join("\n");

    var connectors = new ReplitConnectors();
    var response = await connectors.proxy("github", "/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ["report"],
      }),
    });

    var result = await response.json();

    if (result.id) {
      console.log("Report created: #" + result.number + " - " + issueTitle);
      return res.json({ success: true, issue_number: result.number });
    } else {
      console.error("GitHub API error:", JSON.stringify(result));
      return res.status(502).json({ success: false, error: "Failed to send report. Please try again." });
    }
  } catch (err) {
    console.error("Report error:", err.message);
    return res.status(500).json({ success: false, error: "Server error. Please try again later." });
  }
});

app.get("/api/health", function (req, res) {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, "0.0.0.0", function () {
  console.log("VJs TV API server running on port " + PORT);
});
