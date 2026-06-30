import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { nextTerminalCode } from "@/lib/terminaux";
import { NouveauTerminalForm } from "@/components/terminaux/NouveauTerminalForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nouveau terminal de caisse",
};

export default async function NouveauTerminalPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const terminaux = await prisma.terminalCaisse.findMany({ select: { code: true } });
  const defaultCode = nextTerminalCode(terminaux.map((t) => t.code));

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Nouveau terminal de caisse</h1>
      <NouveauTerminalForm defaultCode={defaultCode} />
    </main>
  );
}
