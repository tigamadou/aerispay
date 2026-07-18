/**
 * C2.1 — Pont périphériques (process principal Electron).
 * Pilote l'imprimante ESC/POS et le tiroir-caisse branchés sur CE poste. Reçoit les
 * lignes de ticket déjà construites par le nœud magasin (`buildReceiptContent`) — aucune
 * logique métier ici, uniquement le transport vers le matériel local.
 *
 * Les défaillances matérielles APRÈS validation d'une vente ne doivent jamais annuler
 * la vente (déjà persistée côté nœud) : ces fonctions renvoient un statut, sans throw.
 */

export interface DeviceResult {
  success: boolean;
  message: string;
}

export interface PrinterEnv {
  type: "EPSON" | "STAR";
  interface: string;
  width: 32 | 48;
}

function printerEnv(): PrinterEnv {
  return {
    type: (process.env.PRINTER_TYPE as "EPSON" | "STAR") ?? "EPSON",
    interface: process.env.PRINTER_INTERFACE ?? "tcp://127.0.0.1:9100",
    width: process.env.PRINTER_WIDTH === "32" ? 32 : 48,
  };
}

/** Imprime un ticket à partir de lignes de texte fournies par le nœud. */
export async function printTicket(lines: string[]): Promise<DeviceResult> {
  try {
    const { ThermalPrinter, PrinterTypes } = await import("node-thermal-printer");
    const env = printerEnv();
    const printer = new ThermalPrinter({
      type: PrinterTypes[env.type],
      interface: env.interface,
      width: env.width,
    });
    if (!(await printer.isPrinterConnected())) {
      return { success: false, message: "Imprimante non joignable" };
    }
    for (const line of lines) printer.println(line);
    printer.cut();
    await printer.execute();
    return { success: true, message: "Ticket imprimé" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    return { success: false, message: `Erreur imprimante : ${msg}` };
  }
}

/** Ouvre le tiroir-caisse (impulsion via l'imprimante). */
export async function openDrawer(): Promise<DeviceResult> {
  try {
    const { ThermalPrinter, PrinterTypes } = await import("node-thermal-printer");
    const env = printerEnv();
    const printer = new ThermalPrinter({ type: PrinterTypes[env.type], interface: env.interface });
    if (!(await printer.isPrinterConnected())) {
      return { success: false, message: "Tiroir-caisse non joignable" };
    }
    printer.openCashDrawer();
    await printer.execute();
    return { success: true, message: "Tiroir ouvert" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    return { success: false, message: `Erreur tiroir : ${msg}` };
  }
}
