/**
 * Thermal printer & cash drawer abstraction.
 * Uses environment variables for configuration.
 * Falls back gracefully when printer is disabled or unreachable.
 */

export interface PrinterConfig {
  enabled: boolean;
  type: "EPSON" | "STAR";
  interface: string;
  width: 48 | 32;
}

export interface CashDrawerConfig {
  enabled: boolean;
  mode: "printer" | "direct";
  pin: 2 | 5;
  openOnCash: boolean;
}

export function getPrinterConfig(): PrinterConfig {
  return {
    enabled: process.env.PRINTER_ENABLED === "true",
    type: (process.env.PRINTER_TYPE as "EPSON" | "STAR") ?? "EPSON",
    interface: process.env.PRINTER_INTERFACE ?? "tcp://127.0.0.1:9100",
    width: parseInt(process.env.PRINTER_WIDTH ?? "48") === 32 ? 32 : 48,
  };
}

export function getCashDrawerConfig(): CashDrawerConfig {
  return {
    enabled: process.env.CASH_DRAWER_ENABLED === "true",
    mode: (process.env.CASH_DRAWER_MODE as "printer" | "direct") ?? "printer",
    pin: parseInt(process.env.CASH_DRAWER_PIN ?? "2") === 5 ? 5 : 2,
    openOnCash: process.env.CASH_DRAWER_OPEN_ON_CASH !== "false",
  };
}

export interface PrintResult {
  success: boolean;
  message: string;
}

export interface PrintReceiptOptions {
  config?: Partial<PrinterConfig>;
  /** Lignes de texte du ticket (cf. `buildReceiptContent`). */
  lines?: string[];
}

export async function printReceipt(
  _venteId: string,
  options?: PrintReceiptOptions
): Promise<PrintResult> {
  const printerConfig = { ...getPrinterConfig(), ...options?.config };

  if (!printerConfig.enabled) {
    return { success: false, message: "Imprimante désactivée (PRINTER_ENABLED=false)" };
  }

  try {
    // Dynamic import to avoid errors when node-thermal-printer is not installed
    const { ThermalPrinter, PrinterTypes } = await import("node-thermal-printer");

    const printer = new ThermalPrinter({
      type: PrinterTypes[printerConfig.type],
      interface: printerConfig.interface,
      width: printerConfig.width,
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return { success: false, message: "Imprimante non joignable" };
    }

    // C2.1 — contenu réel du ticket (construit via buildReceiptContent côté appelant).
    for (const line of options?.lines ?? []) {
      printer.println(line);
    }
    printer.cut();
    await printer.execute();

    return { success: true, message: "Ticket envoyé à l'imprimante" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    return { success: false, message: `Erreur imprimante : ${msg}` };
  }
}

export async function openCashDrawer(
  config?: Partial<CashDrawerConfig>
): Promise<PrintResult> {
  const drawerConfig = { ...getCashDrawerConfig(), ...config };

  if (!drawerConfig.enabled) {
    return { success: false, message: "Tiroir-caisse désactivé (CASH_DRAWER_ENABLED=false)" };
  }

  try {
    const { ThermalPrinter, PrinterTypes } = await import("node-thermal-printer");
    const printerConfig = getPrinterConfig();

    const printer = new ThermalPrinter({
      type: PrinterTypes[printerConfig.type],
      interface: printerConfig.interface,
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return { success: false, message: "Tiroir-caisse non joignable" };
    }

    await printer.openCashDrawer();
    await printer.execute();

    return { success: true, message: "Tiroir-caisse ouvert" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    return { success: false, message: `Erreur tiroir-caisse : ${msg}` };
  }
}
