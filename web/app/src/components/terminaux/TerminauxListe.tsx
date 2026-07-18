import Link from "next/link";

export interface TerminalListItem {
  id: string;
  code: string;
  nom: string;
  active: boolean;
  createdAt: Date | string;
  sessionOuverte: { id: string; caissier: string; ouvertureAt: Date | string } | null;
  soldeEspeces: number;
}

export function TerminauxListe({ items, canManage }: { items: TerminalListItem[]; canManage: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Terminaux de caisse</h1>
        {canManage && (
          <Link
            href="/terminaux/nouveau"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Nouveau terminal
          </Link>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-zinc-500">
            <th className="py-2">Code</th>
            <th>Nom</th>
            <th>Statut</th>
            <th>Session</th>
            <th>Solde espèces</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} className="border-t">
              <td className="py-2 font-mono">{t.code}</td>
              <td>{t.nom}</td>
              <td>{t.active ? "Actif" : "Inactif"}</td>
              <td>{t.sessionOuverte ? `Ouverte — ${t.sessionOuverte.caissier}` : "Fermée"}</td>
              <td>{t.soldeEspeces.toLocaleString("fr-FR")} FCFA</td>
              <td>
                <Link href={`/terminaux/${t.id}`} className="text-indigo-600 hover:underline">
                  Détail
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
