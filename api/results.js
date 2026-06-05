import {
  allowOrigin,
  fetchStaticResult,
  redisResult,
  sendJson,
  setCors
} from "./_shared.js";

export default async function handler(req, res) {
  setCors(req, res, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }
  if (!allowOrigin(req.headers.origin)) {
    sendJson(res, 403, { ok: false, error: "提交来源未授权。" });
    return;
  }

  try {
    const result = await redisResult();
    if (result) {
      sendJson(res, 200, { ok: true, result, source: "redis" });
      return;
    }
    sendJson(res, 200, { ok: true, result: await fetchStaticResult(), source: "static" });
  } catch (error) {
    const fallback = await fetchStaticResult();
    sendJson(res, 200, {
      ok: true,
      source: "static",
      result: {
        ...fallback,
        realtime: false,
        error: error instanceof Error ? error.message : "实时榜单暂不可用。"
      }
    });
  }
}
