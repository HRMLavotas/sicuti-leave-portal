import { createClient } from "@supabase/supabase-js";
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

function getTokenExpirySeconds(token) {
  const [, payload] = String(token || "").split(".");
  if (!payload) return 0;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return typeof decoded.exp === "number" ? decoded.exp : 0;
  } catch {
    return 0;
  }
}

async function refreshSimpelSession(refreshToken) {
  const simpelUrl = process.env.SIMPEL_URL;
  const simpelAnonKey = process.env.SIMPEL_ANON_KEY;

  if (!simpelUrl || !simpelAnonKey) {
    throw new Error("SIMPEL_URL dan SIMPEL_ANON_KEY wajib di environment server");
  }

  const client = createClient(simpelUrl, simpelAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session?.access_token) {
    throw new Error(error?.message || "Refresh session SIMPEL gagal");
  }

  return data.session;
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
    const { refresh_token } = req.body ?? {};
    if (!refresh_token) {
      return res.status(400).json({ error: "Refresh token wajib" });
    }

    const refreshed = await refreshSimpelSession(refresh_token);
    const result = await exchangeSsoCredentials({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || refresh_token,
    });

    return res.status(200).json({
      ...result,
      session: {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || refresh_token,
        expires_at: refreshed.expires_at || getTokenExpirySeconds(refreshed.access_token),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh SSO gagal";
    console.error("[api/auth-refresh]", message);
    return res.status(401).json({ error: message });
  }
}
