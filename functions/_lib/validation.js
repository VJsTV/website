const ALLOWED_VIDEO_HOSTS = [
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
];

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
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Video URL must use http(s)." };
  }
  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_VIDEO_HOSTS.indexOf(host) === -1) {
    return { ok: false, error: "Video URL must be a Vimeo or YouTube link." };
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

export function sanitizeForLLM(text, maxLen) {
  if (!text) return "";
  const limit = maxLen || 1500;
  return String(text)
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/```/g, "'''")
    .slice(0, limit);
}

export function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
