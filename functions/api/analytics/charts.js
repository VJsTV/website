import { preflight, originAllowed } from "../../_lib/cors.js";
import { json } from "../../_lib/json.js";
import { countryNames } from "../../_lib/country-names.js";

export async function handle(request, env) {

  const pre = preflight(request, env, "GET, OPTIONS");
  if (pre) return pre;

  if (request.method !== "GET") {
    return json({ success: false, error: "Method not allowed" }, 405, request, env);
  }

  if (!originAllowed(request, env)) {
    return json({ error: "Origin not allowed." }, 403, request, env);
  }

  const CF_API_TOKEN = env.CF_API_TOKEN;
  const CF_ZONE_ID = env.CF_ZONE_ID;
  const cacheHeaders = { "Cache-Control": "public, max-age=600" };
  const empty = { dailyData: [], topCountries: [], totalUniques: 0, maxUniques: 0, monthlyVisitors: 0 };

  if (!CF_API_TOKEN || !CF_ZONE_ID) {
    return json(Object.assign({}, empty, { error: "Analytics not configured" }), 200, request, env, cacheHeaders);
  }

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const start = startDate.toISOString().split("T")[0];
    const end = now.toISOString().split("T")[0];

    const query = '{ viewer { zones(filter: { zoneTag: "' + CF_ZONE_ID +
      '" }) { httpRequests1dGroups(limit: 31, filter: { date_geq: "' + start +
      '", date_leq: "' + end +
      '" }, orderBy: [date_ASC]) { dimensions { date } sum { pageViews requests countryMap { clientCountryName requests } } uniq { uniques } } } } }';

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
      return json(Object.assign({}, empty, { error: "Analytics upstream error" }), 200, request, env, cacheHeaders);
    }

    const groups = (cfData.data && cfData.data.viewer && cfData.data.viewer.zones &&
      cfData.data.viewer.zones[0] && cfData.data.viewer.zones[0].httpRequests1dGroups) || [];

    const dailyData = [];
    let totalUniques = 0;
    let maxUniques = 0;
    let monthlyVisitors = 0;
    const countryTotals = {};

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const dims = g.dimensions || {};
      const sum = g.sum || {};
      const uniq = g.uniq || {};
      const dayUniques = uniq.uniques || 0;
      totalUniques += dayUniques;
      if (dayUniques > maxUniques) maxUniques = dayUniques;
      monthlyVisitors += sum.pageViews || 0;

      dailyData.push({
        date: dims.date,
        uniques: dayUniques,
        pageViews: sum.pageViews || 0,
        requests: sum.requests || 0,
      });

      const cm = sum.countryMap || [];
      for (let j = 0; j < cm.length; j++) {
        const code = cm[j].clientCountryName;
        const reqs = cm[j].requests || 0;
        countryTotals[code] = (countryTotals[code] || 0) + reqs;
      }
    }

    const topCountries = Object.keys(countryTotals)
      .map(function (k) { return { country: k, countryName: countryNames[k] || k, requests: countryTotals[k] }; })
      .sort(function (a, b) { return b.requests - a.requests; })
      .slice(0, 10);

    return json({
      dailyData: dailyData,
      topCountries: topCountries,
      totalUniques: totalUniques,
      maxUniques: maxUniques,
      monthlyVisitors: monthlyVisitors,
      cached: false,
    }, 200, request, env, cacheHeaders);
  } catch (err) {
    return json(Object.assign({}, empty, { error: "Analytics fetch failed" }), 500, request, env, cacheHeaders);
  }
}
