import { json } from "../_lib/json.js";
import { guardPost } from "../_lib/guard.js";
import { createIssue } from "../_lib/github.js";
import { moderateContent } from "../_lib/moderation.js";
import { sendEmail, emailTemplate } from "../_lib/email.js";
import { isValidEmail } from "../_lib/validation.js";

export async function handle(request, env) {

  const guard = await guardPost(request, env, { endpoint: "booking" });
  if (guard.response) return guard.response;
  const data = guard.data;

  const subject = String(data.subject || "").trim().slice(0, 200);
  const profileType = String(data.profile_type || "artist").trim().slice(0, 50);
  const serviceType = String(data.service_type || "").trim().slice(0, 100);
  const eventName = String(data.event_name || "").trim().slice(0, 200);
  const eventDate = String(data.event_date || "").trim().slice(0, 100);
  const location = String(data.location || "").trim().slice(0, 200);
  const budget = String(data.budget || "").trim().slice(0, 100);
  const description = String(data.description || "").trim().slice(0, 3000);
  const contactName = String(data.contact_name || "").trim().slice(0, 100);
  const contactEmail = String(data.contact_email || "").trim().slice(0, 254);
  const organisation = String(data.organisation || "").trim().slice(0, 200);

  if (!serviceType || !eventName || !eventDate || !contactName || !contactEmail) {
    return json({
      success: false,
      error: "Please fill in all required fields (service type, event name, date, name, and email).",
    }, 400, request, env);
  }

  if (!isValidEmail(contactEmail)) {
    return json({ success: false, error: "Please provide a valid email address." }, 400, request, env);
  }

  const moderation = await moderateContent(
    env,
    [subject, serviceType, eventName, description, contactName, organisation].join("\n"),
    "booking"
  );
  if (moderation.available && !moderation.approved) {
    return json({
      success: false,
      moderated: true,
      error: "Enquiry flagged by moderation: " + (moderation.reason || "Content policy violation."),
    }, 422, request, env);
  }

  const labelMap = { artist: "booking", studio: "studio-enquiry", project: "commission" };
  const issueLabel = labelMap[profileType] || "booking";
  const eyebrowMap = {
    artist: "BOOKING REQUEST",
    studio: "STUDIO ENQUIRY",
    project: "COMMISSION REQUEST",
  };
  const eyebrow = eyebrowMap[profileType] || "BOOKING REQUEST";
  const profileLabel = profileType === "studio" ? "studio"
    : profileType === "project" ? "project" : "artist";

  const issueTitle = "[" + eyebrow + "] " + (subject || eventName) + " \u2013 " + contactName;

  const moderationNote = moderation.needsReview
    ? "\n\n> **AI Moderation:** Needs manual review (moderator unavailable)."
    : (moderation.confidence
      ? "\n\n> **AI Moderation:** Approved (confidence: " + (moderation.confidence * 100).toFixed(0) + "%)"
      : "");

  const issueBody = [
    "## " + eyebrow, "",
    "**" + (profileLabel.charAt(0).toUpperCase() + profileLabel.slice(1)) + ":** " + (subject || "N/A"),
    "**Service Type:** " + serviceType,
    "**Event / Project:** " + eventName,
    "**Date / Timeframe:** " + eventDate,
    "**Location:** " + (location || "N/A"),
    "**Budget Range:** " + (budget || "N/A"),
    "", "### Project Description", "",
    description || "_No description provided._",
    "", "---", "", "### Booker Details", "",
    "**Name:** " + contactName,
    "**Email:** " + contactEmail,
    "**Organisation:** " + (organisation || "N/A"),
    "", "---",
    "*Submitted via vjstv.com " + profileLabel + " page*" + moderationNote,
  ].join("\n");

  const labels = [issueLabel];
  if (moderation.needsReview) labels.push("needs-review");

  try {
    const issue = await createIssue(env, issueTitle, issueBody, labels);
    if (!issue.ok) {
      return json({ success: false, error: "Failed to send enquiry. Please try again." }, 502, request, env);
    }

    await sendEmail(env, contactEmail,
      eyebrow.charAt(0) + eyebrow.slice(1).toLowerCase() + " received \u2013 " + (subject || eventName),
      emailTemplate("Your enquiry has been received", `
        <p style="color:#ffffff;margin:0 0 12px 0;">Hi <strong>${contactName.replace(/[<>]/g, "")}</strong>,</p>
        <p>Thank you for your ${profileLabel === "studio" ? "studio enquiry" : profileLabel === "project" ? "commission request" : "booking request"} for <strong style="color:#ffffff;">${(subject || eventName).replace(/[<>]/g, "")}</strong>.</p>
        <p>Our team will review your enquiry and get back to you shortly.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Service</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">${serviceType.replace(/[<>]/g, "")}</td></tr>
          <tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Event</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">${eventName.replace(/[<>]/g, "")}</td></tr>
          <tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Date</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">${eventDate.replace(/[<>]/g, "")}</td></tr>
          ${location ? '<tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Location</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">' + location.replace(/[<>]/g, "") + '</td></tr>' : ''}
          ${budget ? '<tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a;">Budget</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;">' + budget.replace(/[<>]/g, "") + '</td></tr>' : ''}
        </table>
        ${description ? '<div style="background:#111;padding:16px;margin:16px 0;border-left:3px solid #ff0044;"><p style="color:#ccc;margin:0;font-size:13px;">' + description.replace(/[<>]/g, "").slice(0, 400) + (description.length > 400 ? '...' : '') + '</p></div>' : ''}
        <p style="color:#666;font-size:12px;">Tracking reference: #${issue.data.number}</p>
      `)
    );

    return json({ success: true, issue_number: issue.data.number }, 201, request, env);
  } catch (err) {
    return json({ success: false, error: "Server error. Please try again later." }, 500, request, env);
  }
}
