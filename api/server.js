const express = require("express");
const path = require("path");
const { execSync, spawn } = require("child_process");

const app = express();
const PORT = 5000;
const SITE_DIR = path.join(__dirname, "..", "_site");

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.get("/api/health", function (req, res) {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(express.static(SITE_DIR, { extensions: ["html"] }));

app.use(function (req, res, next) {
  var fs = require("fs");
  var urlPath = req.path;
  if (urlPath.endsWith("/")) {
    var indexFile = path.join(SITE_DIR, urlPath, "index.html");
    if (fs.existsSync(indexFile)) {
      return res.sendFile(indexFile);
    }
    var stripped = urlPath.slice(0, -1) + ".html";
    var strippedFile = path.join(SITE_DIR, stripped);
    if (fs.existsSync(strippedFile)) {
      return res.sendFile(strippedFile);
    }
  }
  var withHtml = path.join(SITE_DIR, urlPath + ".html");
  if (fs.existsSync(withHtml)) {
    return res.sendFile(withHtml);
  }
  var withIndex = path.join(SITE_DIR, urlPath, "index.html");
  if (fs.existsSync(withIndex)) {
    return res.sendFile(withIndex);
  }
  next();
});

app.use(function (req, res) {
  var fs = require("fs");
  var filePath = path.join(SITE_DIR, "404.html");
  if (fs.existsSync(filePath)) {
    res.status(404).sendFile(filePath);
  } else {
    res.status(404).send("Page not found");
  }
});

function buildJekyll() {
  console.log("Building Jekyll site...");
  try {
    execSync("bundle exec jekyll build", {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    });
    console.log("Jekyll build complete.");
  } catch (err) {
    console.error("Jekyll build failed:", err.message);
  }
}

function watchJekyll() {
  console.log("Starting Jekyll watch...");
  var child = spawn("bundle", ["exec", "jekyll", "build", "--watch", "--incremental"], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
  child.on("error", function (err) {
    console.error("Jekyll watch error:", err.message);
  });
  child.on("exit", function (code) {
    if (code !== 0) console.error("Jekyll watch exited with code " + code);
  });
}

buildJekyll();

app.listen(PORT, "0.0.0.0", function () {
  console.log("VJs TV dev server running on port " + PORT);
  console.log("API endpoints served by Cloudflare Worker at: https://website.guillaumelauzier.workers.dev");
  watchJekyll();
});
