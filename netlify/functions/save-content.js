/**
 * Save site content.
 * Priority:
 *   1) Netlify Blobs (instant) — needs SITE_ID + NETLIFY_AUTH_TOKEN
 *   2) GitHub commit of content.json — needs GITHUB_TOKEN + GITHUB_OWNER + GITHUB_REPO
 */

const { getStore } = require("@netlify/blobs");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

async function saveToBlobs(content) {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token =
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.BLOBS_TOKEN;

  if (!siteID || !token) {
    return { ok: false, reason: "missing-credentials" };
  }

  const store = getStore({
    name: "site-content",
    siteID,
    token,
    consistency: "strong",
  });
  await store.setJSON("main", content);
  return { ok: true, method: "blobs" };
}

async function saveToGitHub(content) {
  const ghToken = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!ghToken || !owner || !repo) {
    return { ok: false, reason: "missing-credentials" };
  }

  const filePath = "content.json";
  const contentBase64 = Buffer.from(JSON.stringify(content, null, 2) + "\n", "utf8").toString("base64");

  // Get current SHA
  const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
  const getRes = await fetch(getUrl, {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "site-admin",
    },
  });

  let sha;
  if (getRes.ok) {
    const current = await getRes.json();
    sha = current.sha;
  } else if (getRes.status !== 404) {
    const errText = await getRes.text();
    return { ok: false, reason: "github-read-failed", details: errText };
  }

  const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "site-admin",
    },
    body: JSON.stringify({
      message: `Update site content (${new Date().toISOString()})`,
      content: contentBase64,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    return { ok: false, reason: "github-write-failed", details: errText };
  }

  return { ok: true, method: "github" };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

  try {
    const body = JSON.parse(event.body || "{}");
    const password =
      event.headers["x-admin-password"] ||
      event.headers["X-Admin-Password"] ||
      body.password ||
      "";

    if (password !== adminPassword) {
      return json(401, {
        error: "Unauthorized",
        message: "Wrong admin password (default: admin123).",
      });
    }

    if (!body.content || typeof body.content !== "object") {
      return json(400, { error: "Missing content object." });
    }

    const content = body.content;
    if (!content.config) content.config = {};

    // 1) Try Blobs first (instant live update)
    try {
      const blobs = await saveToBlobs(content);
      if (blobs.ok) {
        return json(200, {
          ok: true,
          method: "blobs",
          message: "Saved! Refresh the main website to see your changes.",
        });
      }
    } catch (e) {
      // fall through to GitHub
    }

    // 2) GitHub fallback (updates content.json → Netlify redeploys)
    try {
      const gh = await saveToGitHub(content);
      if (gh.ok) {
        return json(200, {
          ok: true,
          method: "github",
          message: "Saved to GitHub. Netlify will redeploy in about 1–2 minutes.",
        });
      }
    } catch (e) {
      return json(500, {
        error: "Save failed",
        message: String(e.message || e),
      });
    }

    // Neither configured
    return json(503, {
      error: "Not configured",
      message:
        "Add env vars in Netlify, then redeploy. Easiest path: GITHUB_TOKEN + GITHUB_OWNER + GITHUB_REPO. Or for instant save: SITE_ID + NETLIFY_AUTH_TOKEN.",
      setup: {
        github: ["GITHUB_TOKEN (GitHub PAT with repo scope)", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_BRANCH (optional, default main)"],
        blobs: ["SITE_ID (Site details)", "NETLIFY_AUTH_TOKEN (User settings → Personal access tokens)"],
      },
    });
  } catch (err) {
    return json(500, {
      error: "Save failed",
      message: String(err.message || err),
    });
  }
};
