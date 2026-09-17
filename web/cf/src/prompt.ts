/** Prompts de coaching. Le texte vient de shared/prompts/ via le module généré :
 *  src/04_coaching/prompt.py et ce fichier lisent la MÊME source. Seul le rendu du
 *  message utilisateur (render/renderGame) est du code, et il reste ici. */

import { SYSTEM, SYSTEM_GAME } from "./generated/shared";

export { SYSTEM, SYSTEM_GAME };

export function render(payload: Record<string, any>): [string, string] {
  const meta = payload.meta;
  let user = `Signaux de tes ${meta.n_games_me} dernières games `
    + `(${meta.scope}, issue=${meta.outcome_focus}, vs ${meta.target}) :\n\n`
    + JSON.stringify(payload, undefined, 2)
    + "\n\nProduis la review.";
  if (meta.qualitative_mode === "unbalanced" || meta.unbalanced_causes) {
    const losses = meta.n_game_reviews_available_losses ?? meta.n_game_reviews_losses ?? 0;
    const available = meta.n_game_reviews_available ?? 1;
    user += "\n\nNOTE BIAIS D'ÉCHANTILLONNAGE : Le joueur n'a fait analyser que des "
      + (losses > 0 ? "défaites" : "victoires")
      + ` en partie unitaire (${available} disponible(s), une seule injectée). `
      + "Cette cause isolée n'est PAS représentative de tout son profil. "
      + "Fonde prioritairement tes constats sur les signaux statistiques réels.";
  }
  return [SYSTEM, user];
}

export function renderGame(payload: Record<string, any>): [string, string] {
  const meta = payload.meta;
  const issue = meta.win ? "victoire" : "défaite";
  const user = `Journal de ta game ${meta.match_id} — ${meta.champion} vs `
    + `${meta.opponent || "?"} (${meta.role}, ${issue}, ${meta.duration_min} min), `
    + `repères ${meta.target} :\n\n${JSON.stringify(payload, undefined, 2)}`
    + "\n\nProduis la review de cette game.";
  return [SYSTEM_GAME, user];
}

export async function versionOf(system: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(system));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}
