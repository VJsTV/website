import { preflight, originAllowed } from "../_lib/cors.js";
import { json } from "../_lib/json.js";

export async function onRequest(context) {
  const { request, env } = context;

  const pre = preflight(request, env, "GET, OPTIONS");
  if (pre) return pre;

  if (request.method !== "GET") {
    return json({ success: false, error: "Method not allowed" }, 405, request, env);
  }

  if (!originAllowed(request, env)) {
    return json({ monthlyVisitors: 0, error: "Origin not allowed." }, 403, request, env);
  }

  const CF_API_TOKEN = env.CF_API_TOKEN;
  const CF_ZONE_ID = env.CF_ZONE_ID;
  const cacheHeaders = { "Cache-Control": "public, max-age=600" };

  if (!CF_API_TOKEN || !CF_ZONE_ID) {
    return json(
      { monthlyVisitors: 0, cached: false, error: "Analytics not configured" },
      200, request, env, cacheHeaders
    );
  }

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const start = startDate.toISOString().split("T")[0];
    const end = now.toISOString().split("T")[0];

    const query = '{ viewer { zones(filter: { zoneTag: "' + CF_ZONE_ID +
      '" }) { httpRequests1dGroups(limit: 31, filter: { date_geq: "' + start +
      '", date_leq: "' + end + '" }) { sum { pageViews } } } } }';

    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 8000);

    const cfRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + CF_API_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: query }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const cfData = await cfRes.json();

    if (cfData.errors && cfData.errors.length > 0) {
      return json({ monthlyVisitors: 0, cached: false, error: "Analytics upstream error" }, 200, request, env, cacheHeaders);
    }

    const groups = (cfData.data && cfData.data.viewer && cfData.data.viewer.zones &&
      cfData.data.viewer.zones[0] && cfData.data.viewer.zones[0].httpRequests1dGroups) || [];
    let monthlyVisitors = 0;
    for (let i = 0; i < groups.length; i++) {
      const sum = groups[i].sum || {};
      monthlyVisitors += sum.pageViews ? sum.pageViews : 0;
    }

    return json({ monthlyVisitors: monthlyVisitors, cached: false }, 200, request, env, cacheHeaders);
  } catch (err) {
    return json({ monthlyVisitors: 0, cached: false, error: "Analytics fetch failed" }, 500, request, env, cacheHeaders);
  }
}
