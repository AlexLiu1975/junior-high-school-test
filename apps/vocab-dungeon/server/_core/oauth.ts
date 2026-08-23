import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState, encodeOAuthState } from "@shared/const";
import { randomUUID } from "crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined { const value = req.query[key]; return typeof value === "string" ? value : undefined; }
function getApiOrigin(req: Request) { const protocol = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0]; const host = String(req.headers["x-forwarded-host"] || req.headers.host || ""); return `${protocol}://${host}`; }
function isNativeRedirect(value: string | undefined): value is string { return Boolean(value && value.startsWith("vocabdungeon://oauth/callback")); }

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code"); const state = getQueryParam(req, "state");
    if (!code || !state) { res.status(400).json({ error: "code and state are required" }); return; }
    const { nonce } = decodeOAuthState(state); const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) { res.status(403).json({ error: "invalid oauth state" }); return; }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state); const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) { res.status(400).json({ error: "openId missing from user info" }); return; }
      await db.upsertUser({ openId: userInfo.openId, name: userInfo.name || null, email: userInfo.email ?? null, loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null, lastSignedIn: new Date() });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, { name: userInfo.name || "", expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS }); res.redirect(302, "/");
    } catch (error) { console.error("[OAuth] Callback failed", error); res.status(500).json({ error: "OAuth callback failed" }); }
  });

  app.get("/api/oauth/mobile/start", (req: Request, res: Response) => {
    const nativeRedirectUri = getQueryParam(req, "redirectUri"); const portal = process.env.VITE_OAUTH_PORTAL_URL;
    if (!isNativeRedirect(nativeRedirectUri)) { res.status(400).json({ error: "valid native redirectUri is required" }); return; }
    if (!portal) { res.status(500).json({ error: "OAuth portal is not configured" }); return; }
    const callbackUri = `${getApiOrigin(req)}/api/oauth/mobile-callback`; const nonce = randomUUID();
    const state = encodeOAuthState({ redirectUri: callbackUri, nonce, nativeRedirectUri });
    res.cookie(OAUTH_STATE_COOKIE, nonce, { ...getSessionCookieOptions(req), httpOnly: true, maxAge: 10 * 60 * 1000 });
    const url = new URL(`${portal}/app-auth`); url.searchParams.set("appId", process.env.VITE_APP_ID ?? ""); url.searchParams.set("redirectUri", callbackUri); url.searchParams.set("state", state); url.searchParams.set("type", "signIn");
    res.redirect(302, url.toString());
  });

  app.get("/api/oauth/mobile-callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code"); const state = getQueryParam(req, "state"); const stateData = state ? decodeOAuthState(state) : { redirectUri: "" };
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!code || !state || !stateData.nonce || stateData.nonce !== expectedNonce || !isNativeRedirect(stateData.nativeRedirectUri)) { res.status(403).json({ error: "invalid native oauth state" }); return; }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state); const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) { res.status(400).json({ error: "openId missing from user info" }); return; }
      await db.upsertUser({ openId: userInfo.openId, name: userInfo.name || null, email: userInfo.email ?? null, loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null, lastSignedIn: new Date() });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, { name: userInfo.name || "", expiresInMs: ONE_YEAR_MS });
      const separator = stateData.nativeRedirectUri.includes("?") ? "&" : "?"; res.redirect(302, `${stateData.nativeRedirectUri}${separator}token=${encodeURIComponent(sessionToken)}`);
    } catch (error) { console.error("[OAuth] Mobile callback failed", error); res.status(500).json({ error: "Mobile OAuth callback failed" }); }
  });
}
