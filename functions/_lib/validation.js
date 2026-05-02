// Strict allowlist of canonical video hosts. Subdomains are rejected to
// keep the policy auditable; submitters are expected to paste the
// canonical share URL.
const ALLOWED_VIDEO_HOSTS = ["vimeo.com", "youtube.com", "youtu.be"];

export function slugify(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function extractVimeoId(url) {
  if (!url) return null;
  const m = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

export function extractYouTubeId(url) {
  if (!url) return null;
  const u = String(url);
  let m = u.match(/youtu\.be\/([\w-]{6,})/);
  if (m) return m[1];
  m = u.match(/[?&]v=([\w-]{6,})/);
  if (m) return m[1];
  m = u.match(/youtube\.com\/(?:embed|shorts|live)\/([\w-]{6,})/);
  if (m) return m[1];
  return null;
}

export function validateVideoUrl(rawUrl) {
  if (!rawUrl) return { ok: false, error: "Video URL is required." };
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch (e) {
    return { ok: false, error: "Invalid video URL." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Video URL must use https." };
  }
  let host = parsed.hostname.toLowerCase();
  // Strip a single leading "www." so the canonical-host allowlist is honoured
  // without having to enumerate every subdomain.
  if (host.indexOf("www.") === 0) host = host.slice(4);
  if (ALLOWED_VIDEO_HOSTS.indexOf(host) === -1) {
    return { ok: false, error: "Video URL must be a vimeo.com, youtube.com or youtu.be link." };
  }
  if (extractVimeoId(parsed.href) || extractYouTubeId(parsed.href)) {
    return { ok: true, url: parsed.href };
  }
  return { ok: false, error: "Could not extract a video ID from that URL." };
}

export function mapTypeToLabel(category) {
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

export async function readBody(request) {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (contentType.indexOf("application/json") !== -1) return await request.json();
  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
}

// Strip the markers most often used to break out of a quoted user-content
// block in an LLM prompt: control characters, fenced-code-style triple
// backticks, triple single/double quotes, and explicit role-switch tokens.
// This is defense-in-depth, not a guarantee — moderation.js still reads the
// model output as DATA only and tags ambiguous results needs-review.
const PROMPT_INJECTION_MARKERS = [
  /```/g,
  /'''/g,
  /"""/g,
  /<<</g,
  />>>/g,
  /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|messages?)/gi,
  /\bsystem\s*:/gi,
  /\bassistant\s*:/gi,
  /\buser\s*:/gi,
  /\[\s*\/?\s*(?:inst|sys|system|user|assistant)\s*\]/gi,
];

export function sanitizeForLLM(text, maxLen) {
  if (!text) return "";
  const limit = maxLen || 1500;
  let s = String(text).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
  for (let i = 0; i < PROMPT_INJECTION_MARKERS.length; i++) {
    s = s.replace(PROMPT_INJECTION_MARKERS[i], "[redacted]");
  }
  return s.slice(0, limit);
}

export function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
