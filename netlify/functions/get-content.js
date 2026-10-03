const fs = require("fs");
const path = require("path");

function openBlobsStore() {
  try {
    const { getStore } = require("@netlify/blobs");
    const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
    const token =
      process.env.NETLIFY_AUTH_TOKEN ||
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.BLOBS_TOKEN;
    if (siteID && token) {
      return getStore({ name: "site-content", siteID, token, consistency: "strong" });
    }
  } catch (e) {}
  return null;
}

function readStatic() {
  const candidates = [
    path.join(process.cwd(), "content.json"),
    path.join(__dirname, "..", "..", "content.json"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {}
  }
  return null;
}

exports.handler = async () => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  try {
    const store = openBlobsStore();
    if (store) {
      const live = await store.get("main", { type: "json" });
      if (live && typeof live === "object") {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ source: "blobs", content: live }),
        };
      }
    }
  } catch (e) {}

  const fileContent = readStatic();
  if (fileContent) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ source: "file", content: fileContent }),
    };
  }

  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ error: "No content found" }),
  };
};
