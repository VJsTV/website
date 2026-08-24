import { json } from "../_lib/json.js";
import { guardPost } from "../_lib/guard.js";
import { createIssue } from "../_lib/github.js";
import { moderateContent } from "../_lib/moderation.js";
import { isValidEmail } from "../_lib/validation.js";

export async function handle(request, env) {

  const guard = await guardPost(request, env, { endpoint: "partner" });
  if (guard.response) return guard.response;
  const data = guard.data;

  const fullName = String(data.full_name || data.name || "").trim().slice(0, 100);
  const company = String(data.company || "").trim().slice(0, 200);
  const email = String(data.email || "").trim().slice(0, 254);
  const tier = String(data.tier || "").trim().slice(0, 100);
  const message = String(data.message || "").trim().slice(0, 3000);

  if (!fullName || !email || !message) {
    return json({ success: false, error: "Name, email, and message are required." }, 400, request, env);
  }
  if (!isValidEmail(email)) {
    return json({ success: false, error: "Please provide a valid email address." }, 400, request, env);
  }

  const moderation = await moderateContent(env, [fullName, company, message].join("\n"), "partnership");
  if (moderation.available && !moderation.approved) {
    return json({
      success: false,
      moderated: true,
      error: "Enquiry flagged by moderation: " + (moderation.reason || "Content policy violation."),
    }, 422, request, env);
  }

  const moderationNote = moderation.needsReview
    ? "\n\n> **AI Moderation:** Needs manual review (moderator unavailable)."
    : (moderation.confidence
      ? "\n\n> **AI Moderation:** Approved (confidence: " + (moderation.confidence * 100).toFixed(0) + "%)"
      : "");

  const issueTitle = "SPONSORS & PARTNERS \u2013 " + (company || fullName);
  const issueBody = [
    "## Partnership Enquiry", "",
    "**Name:** " + fullName,
    "**Company:** " + (company || "N/A"),
    "**Email:** " + email,
    "**Partnership Tier:** " + (tier || "Not sure yet"),
    "", "### Brand & Goals", "", message,
    "", "---", "*Submitted via vjstv.com sponsors page*" + moderationNote,
  ].join("\n");

  const labels = ["partnership"];
  if (moderation.needsReview) labels.push("needs-review");

  try {
    const issue = await createIssue(env, issueTitle, issueBody, labels);
    if (!issue.ok) {
      return json({ success: false, error: "Failed to send enquiry. Please try again." }, 502, request, env);
    }
    return json({ success: true, issue_number: issue.data.number }, 201, request, env);
  } catch (err) {
    return json({ success: false, error: "Server error. Please try again later." }, 500, request, env);
  }
}
