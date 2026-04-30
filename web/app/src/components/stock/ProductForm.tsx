"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface CategorieOption {
  id: string;
  nom: string;
}

interface ProductFormProps {
  mode: "create" | "edit";
  categories: CategorieOption[];
  initialData?: {
    id: string;
    nom: string;
    codeBarres: string | null;
    categorieId: string;
    prixAchat: number;
    prixVente: number;
    tva: number;
    unite: string;
    stockMinimum: number;
    stockMaximum: number | null;
    description: string | null;
    image: string | null;
    actif: boolean;
  };
}

export function ProductForm({ mode, categories, initialData }: ProductFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [nom, setNom] = useState(initialData?.nom ?? "");
  const [codeBarres, setCodeBarres] = useState(initialData?.codeBarres ?? "");
  const [categorieId, setCategorieId] = useState(initialData?.categorieId ?? categories[0]?.id ?? "");
  const [prixAchat, setPrixAchat] = useState(initialData?.prixAchat?.toString() ?? "");
  const [prixVente, setPrixVente] = useState(initialData?.prixVente?.toString() ?? "");
  const [tva, setTva] = useState(initialData?.tva?.toString() ?? "0");
  const [unite, setUnite] = useState(initialData?.unite ?? "unité");
  const [stockMinimum, setStockMinimum] = useState(initialData?.stockMinimum?.toString() ?? "5");
  const [stockMaximum, setStockMaximum] = useState(initialData?.stockMaximum?.toString() ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initialData?.image ?? "");
  const [actif, setActif] = useState(initialData?.actif ?? true);

  const achat = parseFloat(prixAchat) || 0;
  const vente = parseFloat(prixVente) || 0;
  const marge = vente > 0 ? ((vente - achat) / vente) * 100 : 0;

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erreur lors de l'upload");
        return;
      }

      const { data } = await res.json();
      setImageUrl(data.url);
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setUploading(false);
    }
  }

  async function handleImageDelete() {
    if (!imageUrl) return;
    setError("");
    try {
      await fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl }),
      });
    } catch {
      // S3 delete failure is non-blocking
    }
    setImageUrl("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);

    try {
      const url = mode === "create" ? "/api/produits" : `/api/produits/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const body: Record<string, unknown> = {
        nom,
        categorieId,
        prixAchat: parseFloat(prixAchat),
        prixVente: parseFloat(prixVente),
        tva: parseFloat(tva),
        unite,
        stockMinimum: parseInt(stockMinimum),
        description: description || undefined,
      };

      if (codeBarres) body.codeBarres = codeBarres;
      if (stockMaximum) body.stockMaximum = parseInt(stockMaximum);
      if (imageUrl) body.image = imageUrl;
      else if (mode === "edit" && !imageUrl && initialData?.image) body.image = null;
      if (mode === "edit") body.actif = actif;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Une erreur est survenue");
        return;
      }

      router.push("/stock");
      router.refresh();
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setPending(false);
    }
  }

  const inputClasses =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6" data-testid="product-form">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Image */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Image du produit
        </legend>
        <div className="flex items-start gap-4">
          <div
            className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="Aperçu" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-zinc-400 text-center px-2">
                {uploading ? "Upload..." : "Cliquer pour ajouter"}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {uploading ? "Upload en cours..." : "Choisir une image"}
            </button>
            {imageUrl && (
              <button
                type="button"
                onClick={handleImageDelete}
                className="ml-2 text-xs text-red-500 hover:text-red-700"
              >
                Supprimer
              </button>
            )}
            <p className="text-xs text-zinc-400">JPEG, PNG, WebP ou AVIF. Max 5 Mo.</p>
          </div>
        </div>
      </fieldset>

      {/* Informations */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Informations
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="nom" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Nom du produit
            </label>
            <input
              id="nom"
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="codeBarres" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Code-barres (optionnel)
            </label>
            <input
              id="codeBarres"
              type="text"
              minLength={4}
              maxLength={64}
              value={codeBarres}
              onChange={(e) => setCodeBarres(e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="categorieId" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Catégorie
            </label>
            <select
              id="categorieId"
              required
              value={categorieId}
              onChange={(e) => setCategorieId(e.target.value)}
              className={inputClasses}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="unite" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Unité
            </label>
            <select id="unite" value={unite} onChange={(e) => setUnite(e.target.value)} className={inputClasses}>
              <option value="unité">Unité</option>
              <option value="kg">Kilogramme</option>
              <option value="litre">Litre</option>
              <option value="paquet">Paquet</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="description" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Description (optionnel)
          </label>
          <textarea
            id="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClasses}
          />
        </div>
      </fieldset>

      {/* Prix & TVA */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Prix & TVA
        </legend>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="prixAchat" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Prix d'achat (FCFA)
            </label>
            <input
              id="prixAchat"
              type="number"
              required
              min={1}
              step="any"
              value={prixAchat}
              onChange={(e) => setPrixAchat(e.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="prixVente" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Prix de vente (FCFA)
            </label>
            <input
              id="prixVente"
              type="number"
              required
              min={1}
              step="any"
              value={prixVente}
              onChange={(e) => setPrixVente(e.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tva" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              TVA (%)
            </label>
            <input
              id="tva"
              type="number"
              min={0}
              max={100}
              step="any"
              value={tva}
              onChange={(e) => setTva(e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>

        {achat > 0 && vente > 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Marge brute : <span className={marge > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>{marge.toFixed(1)}%</span>
          </p>
        )}
      </fieldset>

      {/* Stock */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Seuils de stock
        </legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="stockMinimum" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Stock minimum (alerte)
            </label>
            <input
              id="stockMinimum"
              type="number"
              min={0}
              value={stockMinimum}
              onChange={(e) => setStockMinimum(e.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="stockMaximum" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Stock maximum (optionnel)
            </label>
            <input
              id="stockMaximum"
              type="number"
              min={1}
              value={stockMaximum}
              onChange={(e) => setStockMaximum(e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>
      </fieldset>

      {mode === "edit" && (
        <div className="flex items-center gap-2">
          <input
            id="actif"
            type="checkbox"
            checked={actif}
            onChange={(e) => setActif(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="actif" className="text-sm text-zinc-700 dark:text-zinc-300">
            Produit actif
          </label>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending || uploading}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending
            ? "Enregistrement..."
            : mode === "create"
              ? "Créer le produit"
              : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/stock")}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
