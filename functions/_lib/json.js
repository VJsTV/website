import { corsHeaders } from "./cors.js";

export function json(data, status, request, env, extraHeaders) {
  const headers = Object.assign(
    { "Content-Type": "application/json; charset=utf-8" },
    corsHeaders(request, env, "POST, GET, OPTIONS"),
    extraHeaders || {}
  );
  return new Response(JSON.stringify(data), { status: status || 200, headers });
}
