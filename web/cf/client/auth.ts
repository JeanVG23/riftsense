export const AUTH_TOKEN_KEY = "coach_auth_token";

export type PostAuthAction = () => void;

export interface CoachOpenAuthDetail {
  action?: PostAuthAction | null;
}

export interface CoachAuthChangeDetail {
  authenticated: boolean;
}

export let authToken: string | null = null;

try {
  authToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
} catch {
  // Le stockage peut être indisponible (navigation privée stricte, SSR ou tests).
}

export function setStoredAuthToken(token: string | null | undefined): void {
  authToken = token || null;
  try {
    if (authToken) window.localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    else window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Le jeton reste utilisable en mémoire pour la session courante.
  }
}

export function withAuthHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  return headers;
}

export function openCoachAuth(action: PostAuthAction | null = null): void {
  window.dispatchEvent(new CustomEvent<CoachOpenAuthDetail>("coach-open-auth", {
    detail: { action },
  }));
}

export function notifyAuthChange(authenticated: boolean): void {
  window.dispatchEvent(new CustomEvent<CoachAuthChangeDetail>("coach-auth-change", {
    detail: { authenticated },
  }));
}
