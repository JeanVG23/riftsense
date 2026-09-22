/**
 * Force un nouveau chargement des lectures KV apres une mutation asynchrone.
 * Isole dans un module pour que les composants puissent le tester sans
 * demander a jsdom de naviguer.
 */
export function reloadPage(): void {
  window.location.reload();
}
