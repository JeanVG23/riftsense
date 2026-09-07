import { describe, expect, it } from "vitest";
import {
  apiAuthStatus,
  apiLogin,
  apiLogout,
  COACH_COOKIE_NAME,
  createAuthToken,
  extractToken,
  isAuthorized,
  verifyAuthToken,
  verifyPassword,
} from "../src/auth";
import type { Env } from "../src/index";

describe("auth - verifyPassword", () => {
  it("compare en temps constant et renvoie true si identique", () => {
    expect(verifyPassword("secret123", "secret123")).toBe(true);
    expect(verifyPassword("secret123", "wrong")).toBe(false);
    expect(verifyPassword("", "secret")).toBe(false);
    expect(verifyPassword("secret", "")).toBe(false);
  });
});

describe("auth - tokens HMAC", () => {
  const SECRET = "super-secret-coach-key";

  it("génère un jeton valide et le vérifie avec succès", async () => {
    const token = await createAuthToken(SECRET, 60_000);
    expect(typeof token).toBe("string");
    expect(token).toContain("coach:");
    const valid = await verifyAuthToken(token, SECRET);
    expect(valid).toBe(true);
  });

  it("refuse un jeton avec un secret différent", async () => {
    const token = await createAuthToken(SECRET, 60_000);
    const valid = await verifyAuthToken(token, "other-secret");
    expect(valid).toBe(false);
  });

  it("refuse un jeton expiré", async () => {
    const token = await createAuthToken(SECRET, 1000, 100_000);
    // now = 200_000 > 101_000 (expiré)
    const valid = await verifyAuthToken(token, SECRET, 200_000);
    expect(valid).toBe(false);
  });

  it("refuse un jeton altéré ou malformé", async () => {
    const token = await createAuthToken(SECRET, 60_000);
    const tampered = token.slice(0, -4) + "abcd";
    expect(await verifyAuthToken(tampered, SECRET)).toBe(false);
    expect(await verifyAuthToken("invalid.token", SECRET)).toBe(false);
    expect(await verifyAuthToken("", SECRET)).toBe(false);
  });

  it("accepte le secret direct comme jeton (accès script / curl)", async () => {
    expect(await verifyAuthToken(SECRET, SECRET)).toBe(true);
  });
});

describe("auth - extractToken", () => {
  it("extrait depuis Authorization: Bearer <token>", () => {
    const req = new Request("http://x/api/test", {
      headers: { Authorization: "Bearer token-123" },
    });
    expect(extractToken(req)).toBe("token-123");
  });

  it("extrait depuis X-Coach-Auth", () => {
    const req = new Request("http://x/api/test", {
      headers: { "X-Coach-Auth": "token-custom" },
    });
    expect(extractToken(req)).toBe("token-custom");
  });

  it("extrait depuis le cookie coach_token", () => {
    const req = new Request("http://x/api/test", {
      headers: { Cookie: `foo=bar; ${COACH_COOKIE_NAME}=token-cookie; other=1` },
    });
    expect(extractToken(req)).toBe("token-cookie");
  });

  it("retourne null si aucun header ni cookie présent", () => {
    const req = new Request("http://x/api/test");
    expect(extractToken(req)).toBeNull();
  });
});

describe("auth - isAuthorized", () => {
  const SECRET = "secret-pass";

  it("retourne false si COACH_AUTH_PASSWORD n'est pas configuré", async () => {
    const req = new Request("http://x/api/coach", {
      headers: { Authorization: "Bearer any" },
    });
    expect(await isAuthorized(req, {} as Env)).toBe(false);
  });

  it("retourne true si un token valide est fourni", async () => {
    const token = await createAuthToken(SECRET);
    const req = new Request("http://x/api/coach", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(await isAuthorized(req, { COACH_AUTH_PASSWORD: SECRET } as Env)).toBe(true);
  });

  it("retourne false si le token est invalide", async () => {
    const req = new Request("http://x/api/coach", {
      headers: { Authorization: "Bearer bad-token" },
    });
    expect(await isAuthorized(req, { COACH_AUTH_PASSWORD: SECRET } as Env)).toBe(false);
  });
});

describe("auth - handlers API", () => {
  const SECRET = "coach-password-123";
  const env: Env = {
    COACH_AUTH_PASSWORD: SECRET,
  } as unknown as Env;

  it("apiLogin: 422 si mot de passe absent", async () => {
    const req = new Request("http://x/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await apiLogin(req, env);
    expect(res.status).toBe(422);
  });

  it("apiLogin: 401 si mot de passe incorrect", async () => {
    const req = new Request("http://x/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "mauvais-mot-de-passe" }),
    });
    const res = await apiLogin(req, env);
    expect(res.status).toBe(401);
  });

  it("apiLogin: 200 avec token et Set-Cookie si mot de passe valide", async () => {
    const req = new Request("https://x/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: SECRET }),
    });
    const res = await apiLogin(req, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; token: string };
    expect(body.ok).toBe(true);
    expect(body.token).toBeDefined();
    expect(await verifyAuthToken(body.token, SECRET)).toBe(true);

    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain(`${COACH_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
  });

  it("apiLogout: retourne ok et vide le cookie", async () => {
    const req = new Request("https://x/api/auth/logout", { method: "POST" });
    const res = apiLogout(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("apiAuthStatus: renvoie état d'authentification", async () => {
    const token = await createAuthToken(SECRET);
    const authedReq = new Request("http://x/api/auth/status", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const resAuth = await apiAuthStatus(authedReq, env);
    expect(await resAuth.json()).toEqual({ configured: true, authenticated: true });

    const unauthedReq = new Request("http://x/api/auth/status");
    const resUnauth = await apiAuthStatus(unauthedReq, env);
    expect(await resUnauth.json()).toEqual({ configured: true, authenticated: false });
  });
});
