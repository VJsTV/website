var express = require("express");
var path = require("path");
var fs = require("fs");
var https = require("https");
var compression = require("compression");
var { spawn } = require("child_process");

var app = express();
var PORT = process.env.PORT || 5000;
var SITE_DIR = path.join(__dirname, "..", "_site");
var IS_PROD = process.env.NODE_ENV === "production" || !!process.env.REPL_SLUG;

var siteReady = false;
var serverStartTime = Date.now();
var jekyllChild = null;

process.on("uncaughtException", function (err) {
  console.error("FATAL uncaught exception — exiting:", err.message, err.stack);
  if (jekyllChild) { jekyllChild.kill("SIGTERM"); jekyllChild = null; }
  process.exit(1);
});

process.on("unhandledRejection", function (reason) {
  console.error("FATAL unhandled rejection — exiting:", reason);
  if (jekyllChild) { jekyllChild.kill("SIGTERM"); jekyllChild = null; }
  process.exit(1);
});

function gracefulShutdown(signal) {
  console.log("Received " + signal + ", shutting down gracefully…");
  if (jekyllChild) {
    jekyllChild.kill("SIGTERM");
    jekyllChild = null;
  }
  process.exit(0);
}
process.on("SIGTERM", function () { gracefulShutdown("SIGTERM"); });
process.on("SIGINT", function () { gracefulShutdown("SIGINT"); });

app.use(compression());

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/api/health", function (req, res) {
  var mem = process.memoryUsage();
  res.json({
    status: "ok",
    ready: siteReady,
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + "MB",
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + "MB",
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + "MB"
    },
    timestamp: new Date().toISOString()
  });
});

app.get("/api/yt-info", function (req, res) {
  var videoId = (req.query.v || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!videoId) return res.status(400).json({ error: "missing v param" });
  var responded = false;
  function sendOnce(status, body) {
    if (responded) return;
    responded = true;
    res.status(status).json(body);
  }
  var url =
    "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D" +
    videoId + "&format=json";
  var request = https.get(url, function (r) {
    var data = "";
    r.on("data", function (chunk) { data += chunk; });
    r.on("end", function () {
      try {
        var parsed = JSON.parse(data);
        sendOnce(200, { title: parsed.title || "", author: parsed.author_name || "" });
      } catch (e) {
        sendOnce(502, { error: "upstream parse error" });
      }
    });
  });
  request.on("error", function (e) {
    sendOnce(502, { error: e.message });
  });
  request.setTimeout(8000, function () {
    request.destroy();
    sendOnce(504, { error: "upstream timeout" });
  });
});

app.use(function (req, res, next) {
  if (!siteReady) {
    return res.status(503)
      .header("Retry-After", "10")
      .send("<!DOCTYPE html><html><head><meta charset='utf-8'><meta http-equiv='refresh' content='5'><title>VJs TV — Loading</title></head><body style='background:#0a0a0a;color:#0f0;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h1>VJs TV</h1><p>Broadcast starting up…</p></div></body></html>");
  }
  next();
});

app.use(express.static(SITE_DIR, {
  extensions: ["html"],
  maxAge: IS_PROD ? "1h" : 0,
  setHeaders: function (res, filePath) {
    if (/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    }
  }
}));

app.use(function (req, res, next) {
  var urlPath = req.path;
  if (urlPath.endsWith("/")) {
    var indexFile = path.join(SITE_DIR, urlPath, "index.html");
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    var stripped = urlPath.slice(0, -1) + ".html";
    var strippedFile = path.join(SITE_DIR, stripped);
    if (fs.existsSync(strippedFile)) return res.sendFile(strippedFile);
  }
  var withHtml = path.join(SITE_DIR, urlPath + ".html");
  if (fs.existsSync(withHtml)) return res.sendFile(withHtml);
  var withIndex = path.join(SITE_DIR, urlPath, "index.html");
  if (fs.existsSync(withIndex)) return res.sendFile(withIndex);
  next();
});

app.use(function (req, res) {
  var filePath = path.join(SITE_DIR, "404.html");
  if (fs.existsSync(filePath)) {
    res.status(404).sendFile(filePath);
  } else {
    res.status(404).send("Page not found");
  }
});

function buildJekyllAsync(callback) {
  console.log("Building Jekyll site...");
  var child = spawn("bundle", ["exec", "jekyll", "build"], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit"
  });
  child.on("error", function (err) {
    console.error("Jekyll build spawn error:", err.message);
    callback(err);
  });
  child.on("exit", function (code) {
    if (code === 0) {
      console.log("Jekyll build complete.");
      callback(null);
    } else {
      callback(new Error("Jekyll build exited with code " + code));
    }
  });
}

function watchJekyll() {
  console.log("Starting Jekyll watch...");
  jekyllChild = spawn("bundle", ["exec", "jekyll", "build", "--watch", "--incremental"], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
  jekyllChild.on("error", function (err) {
    console.error("Jekyll watch error:", err.message);
  });
  jekyllChild.on("exit", function (code) {
    if (code !== 0) console.error("Jekyll watch exited with code " + code);
    jekyllChild = null;
  });
}

app.listen(PORT, "0.0.0.0", function () {
  console.log("VJs TV server listening on port " + PORT);

  buildJekyllAsync(function (err) {
    if (!err) {
      siteReady = true;
      console.log("Site is ready to serve requests.");
    } else {
      console.error("Jekyll build failed:", err.message);
      if (fs.existsSync(path.join(SITE_DIR, "index.html"))) {
        siteReady = true;
        console.log("Using previous build (build failed but _site exists).");
      } else {
        console.error("FATAL: No _site directory available and build failed — exiting.");
        process.exit(1);
      }
    }
    if (!IS_PROD) {
      watchJekyll();
    } else {
      console.log("Production mode — Jekyll watch disabled to conserve resources.");
    }
  });
});
