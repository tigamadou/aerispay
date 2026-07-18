/**
 * Échange du code d'enrôlement contre un token de magasin auprès du nœud.
 * fetch injectable pour les tests.
 */
export type ExchangeResult =
  | { ok: true; storeToken: string; terminalId: string; codePoste: string; nom: string }
  | { ok: false; error: string };

export async function exchangeEnrollment(
  nodeUrl: string,
  token: string,
  nom: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<ExchangeResult> {
  let res: Response;
  try {
    res = await fetchFn(`${nodeUrl}/api/enrollment/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...(nom ? { nom } : {}) }),
    });
  } catch {
    return { ok: false, error: "Serveur injoignable à cette adresse" };
  }

  let body: { data?: { storeToken: string; terminalId: string; codePoste: string; nom: string }; error?: string };
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "Réponse invalide du serveur" };
  }

  if (!res.ok || !body.data) {
    return { ok: false, error: body.error ?? "Échec de l'enrôlement" };
  }
  const d = body.data;
  return { ok: true, storeToken: d.storeToken, terminalId: d.terminalId, codePoste: d.codePoste, nom: d.nom };
}
