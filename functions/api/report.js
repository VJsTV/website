import { json } from "../_lib/json.js";
import { guardPost } from "../_lib/guard.js";
import { createIssue } from "../_lib/github.js";
import { moderateContent } from "../_lib/moderation.js";
import { isValidEmail } from "../_lib/validation.js";

export async function onRequest(context) {
  const { request, env } = context;

  const guard = await guardPost(request, env, { endpoint: "report" });
  if (guard.response) return guard.response;
  const data = guard.data;

  const reporterName = String(data.reporter_name || "").trim().slice(0, 100);
  const description = String(data.description || "").trim().slice(0, 2000);
  const reporterEmail = String(data.reporter_email || "").trim().slice(0, 254);
  const projectTitle = String(data.project_title || "Unknown Project").trim().slice(0, 200);
  const projectUrlRaw = String(data.project_url || "").trim().slice(0, 500);

  if (!reporterName || !description) {
    return json({ success: false, error: "Name and description are required." }, 400, request, env);
  }
  if (reporterEmail && !isValidEmail(reporterEmail)) {
    return json({ success: false, error: "Please provide a valid email address." }, 400, request, env);
  }

  let projectUrl = "";
  if (projectUrlRaw) {
    try {
      const u = new URL(projectUrlRaw);
      if (u.protocol === "https:" || u.protocol === "http:") projectUrl = u.href;
    } catch (e) {
      projectUrl = "";
    }
  }

  const moderation = await moderateContent(env, [reporterName, description, projectTitle].join("\n"), "report");
  if (moderation.available && !moderation.approved) {
    return json({
      success: false,
      moderated: true,
      error: "Report flagged by moderation: " + (moderation.reason || "Content policy violation."),
    }, 422, request, env);
  }

  const moderationNote = moderation.needsReview
    ? "\n\n> **AI Moderation:** Needs manual review (moderator unavailable)."
    : "";

  const issueTitle = "[Report] " + projectTitle + " \u2013 " + reporterName;
  const issueBody = [
    "## Project Issue Report", "",
    "**Reporter:** " + reporterName,
    "**Email:** " + (reporterEmail || "N/A"),
    "**Project:** " + (projectUrl ? "[" + projectTitle + "](" + projectUrl + ")" : projectTitle),
    "", "### Description", "", description,
    "", "---", "*Reported via vjstv.com project page*" + moderationNote,
  ].join("\n");

  const labels = ["report"];
  if (moderation.needsReview) labels.push("needs-review");

  try {
    const issue = await createIssue(env, issueTitle, issueBody, labels);
    if (issue.ok) {
      return json({ success: true, issue_number: issue.data.number }, 201, request, env);
    }
    return json({ success: false, error: "Failed to file report. Please try again." }, 502, request, env);
  } catch (err) {
    return json({ success: false, error: "Server error. Please try again later." }, 500, request, env);
  }
}
