var countryNames = {
  TR:"Turkey",US:"United States",FR:"France",SG:"Singapore",HR:"Croatia",DE:"Germany",
  GB:"United Kingdom",NL:"Netherlands",CA:"Canada",AU:"Australia",JP:"Japan",BR:"Brazil",
  IT:"Italy",ES:"Spain",MX:"Mexico",IN:"India",KR:"South Korea",SE:"Sweden",NO:"Norway",
  DK:"Denmark",FI:"Finland",BE:"Belgium",AT:"Austria",CH:"Switzerland",PT:"Portugal",
  PL:"Poland",CZ:"Czech Republic",RO:"Romania",HU:"Hungary",GR:"Greece",IE:"Ireland",
  RU:"Russia",CN:"China",TW:"Taiwan",TH:"Thailand",ID:"Indonesia",PH:"Philippines",
  VN:"Vietnam",MY:"Malaysia",NZ:"New Zealand",AR:"Argentina",CL:"Chile",CO:"Colombia",
  ZA:"South Africa",EG:"Egypt",NG:"Nigeria",KE:"Kenya",IL:"Israel",AE:"UAE",SA:"Saudi Arabia",
  UA:"Ukraine",SK:"Slovakia",BG:"Bulgaria",RS:"Serbia",LT:"Lithuania",LV:"Latvia",
  EE:"Estonia",IS:"Iceland",LU:"Luxembourg",MT:"Malta",CY:"Cyprus",SI:"Slovenia",
  BA:"Bosnia",ME:"Montenegro",MK:"North Macedonia",AL:"Albania",XK:"Kosovo",MD:"Moldova",
  GE:"Georgia",AM:"Armenia",AZ:"Azerbaijan",BY:"Belarus",KZ:"Kazakhstan",UZ:"Uzbekistan",
  PK:"Pakistan",BD:"Bangladesh",LK:"Sri Lanka",MM:"Myanmar",KH:"Cambodia",LA:"Laos",
  PE:"Peru",EC:"Ecuador",VE:"Venezuela",UY:"Uruguay",PY:"Paraguay",BO:"Bolivia",
  CR:"Costa Rica",PA:"Panama",GT:"Guatemala",HN:"Honduras",SV:"El Salvador",NI:"Nicaragua",
  DO:"Dominican Republic",CU:"Cuba",JM:"Jamaica",TT:"Trinidad and Tobago",PR:"Puerto Rico"
};

export async function onRequestGet(context) {
  const { env } = context;
  const CF_API_TOKEN = env.CF_API_TOKEN;
  const CF_ZONE_ID = env.CF_ZONE_ID;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=600",
  };

  var emptyResult = { dailyData: [], topCountries: [], totalUniques: 0, maxUniques: 0, monthlyVisitors: 0 };

  if (!CF_API_TOKEN || !CF_ZONE_ID) {
    return new Response(JSON.stringify(Object.assign({}, emptyResult, { error: "Analytics not configured" })), { headers });
  }

  try {
    var now = new Date();
    var startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    var start = startDate.toISOString().split("T")[0];
    var end = now.toISOString().split("T")[0];

    var query = '{ viewer { zones(filter: { zoneTag: "' + CF_ZONE_ID + '" }) { httpRequests1dGroups(limit: 31, filter: { date_geq: "' + start + '", date_leq: "' + end + '" }, orderBy: [date_ASC]) { dimensions { date } sum { pageViews requests countryMap { clientCountryName requests } } uniq { uniques } } } } }';

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
      return new Response(JSON.stringify(Object.assign({}, emptyResult, { error: cfData.errors[0].message })), { headers });
    }

    var groups = (cfData.data && cfData.data.viewer && cfData.data.viewer.zones && cfData.data.viewer.zones[0] && cfData.data.viewer.zones[0].httpRequests1dGroups) || [];

    var dailyData = [];
    var totalUniques = 0;
    var maxUniques = 0;
    var monthlyVisitors = 0;
    var countryTotals = {};

    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var dims = g.dimensions || {};
      var sum = g.sum || {};
      var uniq = g.uniq || {};
      var dayUniques = uniq.uniques || 0;
      totalUniques += dayUniques;
      if (dayUniques > maxUniques) maxUniques = dayUniques;
      monthlyVisitors += sum.pageViews || 0;

      dailyData.push({ date: dims.date, uniques: dayUniques, pageViews: sum.pageViews || 0, requests: sum.requests || 0 });

      var cm = sum.countryMap || [];
      for (var j = 0; j < cm.length; j++) {
        var code = cm[j].clientCountryName;
        var reqs = cm[j].requests || 0;
        countryTotals[code] = (countryTotals[code] || 0) + reqs;
      }
    }

    var topCountries = Object.keys(countryTotals)
      .map(function(k) { return { country: k, countryName: countryNames[k] || k, requests: countryTotals[k] }; })
      .sort(function(a, b) { return b.requests - a.requests; })
      .slice(0, 10);

    var result = { dailyData: dailyData, topCountries: topCountries, totalUniques: totalUniques, maxUniques: maxUniques, monthlyVisitors: monthlyVisitors, cached: false };
    return new Response(JSON.stringify(result), { headers });
  } catch (err) {
    return new Response(JSON.stringify(Object.assign({}, emptyResult, { error: err.message })), { status: 500, headers });
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
