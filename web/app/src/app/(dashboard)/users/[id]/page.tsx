import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { UserForm } from "@/components/users/UserForm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Modifier l'utilisateur",
};

interface EditUserPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditUserPage({ params }: EditUserPageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      nom: true,
      email: true,
      role: true,
      actif: true,
    },
  });

  if (!user) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Modifier l&apos;utilisateur
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Modifiez les informations du compte de {user.nom}.
        </p>
      </div>

      <UserForm mode="edit" initialData={user} />
    </div>
  );
}
