import { json } from "../_lib/json.js";
import { guardPost } from "../_lib/guard.js";
import { createIssue } from "../_lib/github.js";
import { moderateContent } from "../_lib/moderation.js";
import {
  slugify,
  extractVimeoId,
  validateVideoUrl,
  mapTypeToLabel,
  isValidEmail,
} from "../_lib/validation.js";

const REQUIRED = ["artist", "project_title", "email", "video_url", "description", "category"];

export async function handle(request, env) {

  const guard = await guardPost(request, env, { endpoint: "submit" });
  if (guard.response) return guard.response;
  const data = guard.data;

  for (let i = 0; i < REQUIRED.length; i++) {
    if (!data[REQUIRED[i]] || String(data[REQUIRED[i]]).trim() === "") {
      return json({ success: false, error: "Missing required fields." }, 400, request, env);
    }
  }

  const artist = String(data.artist).trim().slice(0, 200);
  const projectTitle = String(data.project_title).trim().slice(0, 200);
  const email = String(data.email).trim().slice(0, 254);
  const description = String(data.description).trim().slice(0, 5000);
  const category = String(data.category).trim().slice(0, 60);
  const location = String(data.location || "").trim().slice(0, 200);
  const studio = String(data.studio || "").trim().slice(0, 200);
  const website = String(data.website || "").trim().slice(0, 500);
  const instagram = String(data.instagram || "").trim().slice(0, 200);
  const vimeoProfile = String(data.vimeo || "").trim().slice(0, 200);
  const technologyRaw = String(data.technology || "").trim().slice(0, 500);
  const yearRaw = String(data.year || "").trim();
  const year = /^\d{4}$/.test(yearRaw) ? yearRaw : String(new Date().getFullYear());

  if (!isValidEmail(email)) {
    return json({ success: false, error: "Please provide a valid email address." }, 400, request, env);
  }

  const videoCheck = validateVideoUrl(data.video_url);
  if (!videoCheck.ok) {
    return json({ success: false, error: videoCheck.error }, 400, request, env);
  }
  const videoUrl = videoCheck.url;

  const moderation = await moderateContent(
    env,
    [projectTitle, artist, description, technologyRaw, location].join("\n"),
    "project"
  );
  // Genuine moderator rejection blocks the submission. A "needsReview"
  // signal means the moderator failed (parse error / network) — we still
  // create the issue but tag it for manual review rather than 422-ing the
  // user, since that is fail-safe behaviour, not approval.
  if (moderation.available && !moderation.approved && !moderation.needsReview) {
    return json({
      success: false,
      moderated: true,
      error: "Submission flagged by moderation: " + (moderation.reason || "Content policy violation."),
    }, 422, request, env);
  }

  const vimeoId = extractVimeoId(videoUrl);
  const nameSlug = slugify(projectTitle + "-" + artist);
  const typeLabel = mapTypeToLabel(category);
  const issueTitle = "[" + category + "] " + projectTitle + " \u2013 " + artist;

  const technologies = technologyRaw
    ? technologyRaw.split(",").map(function (t) { return t.trim(); }).filter(Boolean)
    : [];

  const frontMatter = [
    "---",
    'layout: vjs-detail',
    vimeoId ? 'vimeo_id: "' + vimeoId + '"' : null,
    'title: "' + projectTitle.replace(/"/g, '\\"') + '"',
    'name: "' + nameSlug + '"',
    'artist: "' + artist.replace(/"/g, '\\"') + '"',
    'project_type: "' + category + '"',
    'location: "' + location.replace(/"/g, '\\"') + '"',
    'year: ' + year,
    'video_url: "' + (vimeoId ? 'https://player.vimeo.com/video/' + vimeoId : videoUrl) + '"',
    'description: "' + description.replace(/"/g, '\\"').replace(/\n/g, " ") + '"',
    'featured: false',
    website ? 'website: "' + website.replace(/"/g, '\\"') + '"' : null,
    studio ? 'studio: "' + studio.replace(/"/g, '\\"') + '"' : null,
  ].filter(Boolean);

  if (technologies.length > 0) {
    frontMatter.push("technologies:");
    technologies.forEach(function (t) { frontMatter.push('  - "' + t.replace(/"/g, '\\"') + '"'); });
  }

  const social = {};
  if (instagram) social.instagram = instagram;
  if (vimeoProfile) social.vimeo = vimeoProfile;
  if (Object.keys(social).length > 0) {
    frontMatter.push("social:");
    Object.keys(social).forEach(function (k) {
      frontMatter.push('  ' + k + ': "' + social[k].replace(/"/g, '\\"') + '"');
    });
  }

  frontMatter.push("---");
  frontMatter.push("");
  frontMatter.push("**" + projectTitle + "** by **" + artist + "** \u2014 " + description.replace(/\n/g, " "));

  const moderationNote = moderation.needsReview
    ? "\n\n> **AI Moderation:** Needs manual review (moderator unavailable or returned non-JSON)."
    : (moderation.confidence
      ? "\n\n> **AI Moderation:** Approved (confidence: " + (moderation.confidence * 100).toFixed(0) + "%)"
      : "");

  const issueBody = [
    "## Submission Details", "",
    "**Artist / Collective:** " + artist,
    "**Project Title:** " + projectTitle,
    "**Category:** " + category,
    "**Email:** " + email,
    "**Location:** " + (location || "N/A"),
    "**Year:** " + year,
    "**Video Link:** " + videoUrl,
    vimeoId ? "**Vimeo ID:** " + vimeoId : null,
    "", "### Description", "", description, "",
    "**Technologies:** " + (technologyRaw || "N/A"),
    "**Studio:** " + (studio || "N/A"),
    "**Website:** " + (website || "N/A"),
    "**Instagram:** " + (instagram || "N/A"),
    "**Vimeo Profile:** " + (vimeoProfile || "N/A"),
    "", "---", "", "### Jekyll Front Matter (auto-generated)", "",
    "```yaml", frontMatter.join("\n"), "```",
    "", "---", "*Submitted via vjstv.com submission form*" + moderationNote,
  ].filter(function (l) { return l !== null; }).join("\n");

  const labels = ["submission", typeLabel];
  if (moderation.needsReview) labels.push("needs-review");

  try {
    const issue = await createIssue(env, issueTitle, issueBody, labels);
    if (issue.ok) {
      return json({
        success: true,
        issue_number: issue.data.number,
        issue_url: issue.data.html_url,
      }, 201, request, env);
    }
    return json({ success: false, error: "Failed to create submission. Please try again." }, 502, request, env);
  } catch (err) {
    return json({ success: false, error: "Server error. Please try again later." }, 500, request, env);
  }
}
