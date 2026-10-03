exports.handler = async () => {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || null;
  const hasNetlifyToken = !!(
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.BLOBS_TOKEN
  );
  const hasGitHub =
    !!(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO);

  let blobs = "skipped";
  let blobsError = null;
  if (siteID && hasNetlifyToken) {
    try {
      const { getStore } = require("@netlify/blobs");
      const store = getStore({
        name: "site-content",
        siteID,
        token:
          process.env.NETLIFY_AUTH_TOKEN ||
          process.env.NETLIFY_BLOBS_TOKEN ||
          process.env.BLOBS_TOKEN,
      });
      blobs = store ? "ok" : "fail";
    } catch (e) {
      blobs = "error";
      blobsError = String(e.message || e);
    }
  } else {
    blobs = "needs-token";
  }

  const canSave = (siteID && hasNetlifyToken) || hasGitHub;

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      canSave,
      blobs,
      blobsError,
      hasSiteId: !!siteID,
      hasNetlifyToken,
      hasGitHub,
      hint: canSave
        ? "Save is ready. Try admin → Save all changes."
        : "Add env vars then redeploy. Easiest: GITHUB_TOKEN + GITHUB_OWNER + GITHUB_REPO (from your GitHub repo). Or SITE_ID + NETLIFY_AUTH_TOKEN for instant Blobs save.",
    }),
  };
};
