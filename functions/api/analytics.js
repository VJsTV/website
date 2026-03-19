export async function onRequestGet(context) {
  const { env } = context;
  const CF_API_TOKEN = env.CF_API_TOKEN;
  const CF_ZONE_ID = env.CF_ZONE_ID;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=600",
  };

  if (!CF_API_TOKEN || !CF_ZONE_ID) {
    return new Response(JSON.stringify({ monthlyVisitors: 0, cached: false, error: "Analytics not configured" }), { headers });
  }

  try {
    var now = new Date();
    var startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    var start = startDate.toISOString().split("T")[0];
    var end = now.toISOString().split("T")[0];

    var query = '{ viewer { zones(filter: { zoneTag: "' + CF_ZONE_ID + '" }) { httpRequests1dGroups(limit: 31, filter: { date_geq: "' + start + '", date_leq: "' + end + '" }) { sum { pageViews } } } } }';

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 8000);

    var cfRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + CF_API_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: query }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    var cfData = await cfRes.json();

    if (cfData.errors && cfData.errors.length > 0) {
      return new Response(JSON.stringify({ monthlyVisitors: 0, cached: false, error: cfData.errors[0].message }), { headers });
    }

    var groups = (cfData.data && cfData.data.viewer && cfData.data.viewer.zones && cfData.data.viewer.zones[0] && cfData.data.viewer.zones[0].httpRequests1dGroups) || [];
    var monthlyVisitors = 0;
    for (var i = 0; i < groups.length; i++) {
      var sum = groups[i].sum || {};
      monthlyVisitors += sum.pageViews ? sum.pageViews : 0;
    }

    return new Response(JSON.stringify({ monthlyVisitors: monthlyVisitors, cached: false }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ monthlyVisitors: 0, cached: false, error: err.message }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
