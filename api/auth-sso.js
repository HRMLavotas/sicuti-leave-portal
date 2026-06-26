import { exchangeSsoCredentials } from "./_lib/ssoExchange.js";

const ALLOWED_ORIGINS = [
  "https://cuti.sipandai.site",
  "https://sipandai.site",
  "https://www.sipandai.site",
  "http://localhost:5173",
  "http://localhost:4173",
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await exchangeSsoCredentials(req.body);
    return res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "SSO gagal";
    console.error("[api/auth-sso]", message);
    return res.status(401).json({ error: message });
  }
}
