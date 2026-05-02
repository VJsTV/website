const REPO_OWNER = "VJsTV";
const REPO_NAME = "website";
const GH_TIMEOUT_MS = 10000;

export async function createIssue(env, title, body, labels) {
  if (!env || !env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, GH_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.github.com/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues", {
      method: "POST",
      headers: {
        "Authorization": "token " + env.GITHUB_TOKEN,
        "Content-Type": "application/json",
        "User-Agent": "VJsTV-PagesFunction",
        "Accept": "application/vnd.github.v3+json",
      },
      body: JSON.stringify({ title: title, body: body, labels: labels || [] }),
      signal: controller.signal,
    });
    const data = await res.json();
    return { ok: res.ok && !!data.id, status: res.status, data: data };
  } finally {
    clearTimeout(timer);
  }
}
