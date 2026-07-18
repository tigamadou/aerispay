declare module "node-thermal-printer" {
  export enum PrinterTypes {
    EPSON = "epson",
    STAR = "star",
  }

  interface PrinterOptions {
    type: PrinterTypes;
    interface: string;
    width?: number;
  }

  export class ThermalPrinter {
    constructor(options: PrinterOptions);
    isPrinterConnected(): Promise<boolean>;
    execute(): Promise<void>;
    openCashDrawer(): void;
    initialize(): void;
    alignCenter(): void;
    alignLeft(): void;
    alignRight(): void;
    bold(enabled: boolean): void;
    setTextSize(width: number, height: number): void;
    println(text: string): void;
    drawLine(): void;
    cut(): void;
    beep(): void;
    tableCustom(data: Array<{ text: string; align: string; width: number }>): void;
    printQR(data: string): void;
  }
}
