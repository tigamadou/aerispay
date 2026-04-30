import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UserForm } from "@/components/users/UserForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nouvel utilisateur",
};

export default async function NewUserPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Nouvel utilisateur
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Créez un nouveau compte pour le point de vente.
        </p>
      </div>

      <UserForm mode="create" />
    </div>
  );
}
