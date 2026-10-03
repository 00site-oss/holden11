/**
 * Holden-style content API
 * Routes via redirect: /api/content → /.netlify/functions/content
 *
 * GET  ?status=1     → { needsSetup }
 * GET  ?check=1      → auth check
 * GET  ?list=1       → { backups: [] }
 * GET  ?backup=key   → { html }
 * GET  (default)     → { html } live content
 * POST { action:setup, password } → set password
 * POST { html }      → save live + backup
 * DELETE             → reset to original
 */

const { getStore } = require("@netlify/blobs");
const crypto = require("crypto");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-password",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

function json(status, body) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

function openStore() {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token =
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: "holden-cms", siteID, token, consistency: "strong" });
  }
  // Try ambient (some Netlify runtimes)
  try {
    return getStore({ name: "holden-cms", consistency: "strong" });
  } catch (e) {
    try {
      return getStore("holden-cms");
    } catch (e2) {
      const err = new Error(
        "Blobs not configured. Set SITE_ID and NETLIFY_AUTH_TOKEN in Netlify env, then redeploy."
      );
      throw err;
    }
  }
}

function hashPw(pw) {
  return crypto.createHash("sha256").update(String(pw)).digest("hex");
}

function getPassword(event) {
  return (
    event.headers["x-admin-password"] ||
    event.headers["X-Admin-Password"] ||
    ""
  );
}

async function requireAuth(store, event) {
  const meta = (await store.get("meta", { type: "json" })) || {};
  if (!meta.passwordHash) {
    const err = new Error("Admin password not set. Use setup first.");
    err.status = 401;
    throw err;
  }
  const pw = getPassword(event);
  if (hashPw(pw) !== meta.passwordHash) {
    const err = new Error("Wrong password.");
    err.status = 401;
    throw err;
  }
  return meta;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const qs = event.queryStringParameters || {};

  try {
    const store = openStore();

    // ----- GET -----
    if (event.httpMethod === "GET") {
      if (qs.status === "1") {
        const meta = (await store.get("meta", { type: "json" })) || {};
        return json(200, { needsSetup: !meta.passwordHash });
      }

      if (qs.check === "1") {
        await requireAuth(store, event);
        return json(200, { ok: true });
      }

      if (qs.list === "1") {
        await requireAuth(store, event);
        const meta = (await store.get("meta", { type: "json" })) || {};
        return json(200, { backups: meta.backups || [] });
      }

      if (qs.backup) {
        await requireAuth(store, event);
        const html = await store.get(qs.backup, { type: "text" });
        if (!html) return json(404, { error: "Backup not found" });
        return json(200, { html });
      }

      // Public: live HTML (no auth)
      const html = await store.get("live", { type: "text" });
      return json(200, { html: html || null });
    }

    // ----- POST -----
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");

      if (body.action === "setup") {
        const meta = (await store.get("meta", { type: "json" })) || {};
        if (meta.passwordHash) {
          return json(400, { error: "Password already set. Sign in instead." });
        }
        const pw = String(body.password || "");
        if (pw.length < 8) {
          return json(400, { error: "Password must be at least 8 characters." });
        }
        await store.setJSON("meta", {
          passwordHash: hashPw(pw),
          backups: [],
          createdAt: Date.now(),
        });
        return json(200, { ok: true });
      }

      await requireAuth(store, event);

      if (typeof body.html !== "string") {
        return json(400, { error: "Missing html string." });
      }

      // Backup current live
      const meta = (await store.get("meta", { type: "json" })) || { backups: [] };
      const prev = await store.get("live", { type: "text" });
      if (prev) {
        const key = "backup:" + Date.now();
        await store.set(key, prev, { contentType: "text/html" });
        meta.backups = [key, ...(meta.backups || [])].slice(0, 30);
        await store.setJSON("meta", meta);
      }

      await store.set("live", body.html, { contentType: "text/html" });
      return json(200, { ok: true });
    }

    // ----- DELETE (reset) -----
    if (event.httpMethod === "DELETE") {
      await requireAuth(store, event);
      const prev = await store.get("live", { type: "text" });
      if (prev) {
        const meta = (await store.get("meta", { type: "json" })) || { backups: [] };
        const key = "backup:" + Date.now();
        await store.set(key, prev, { contentType: "text/html" });
        meta.backups = [key, ...(meta.backups || [])].slice(0, 30);
        await store.setJSON("meta", meta);
      }
      await store.delete("live");
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: String(err.message || err) });
  }
};
