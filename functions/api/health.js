import { preflight } from "../_lib/cors.js";
import { json } from "../_lib/json.js";

export async function onRequest(context) {
  const { request, env } = context;
  const pre = preflight(request, env, "GET, OPTIONS");
  if (pre) return pre;
  if (request.method !== "GET") {
    return json({ success: false, error: "Method not allowed" }, 405, request, env);
  }
  return json({ status: "ok", timestamp: new Date().toISOString() }, 200, request, env);
}
