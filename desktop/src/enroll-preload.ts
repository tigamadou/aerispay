/**
 * Preload de la fenêtre d'enrôlement (locale). Expose UNIQUEMENT aerisEnroll —
 * jamais exposé à l'UI distante du nœud (fenêtre kiosque = preload séparé).
 */
import { contextBridge, ipcRenderer } from "electron";

import { ENROLL_CHANNELS } from "./channels";

export interface EnrollInput {
  nodeUrl: string;
  token: string;
  nom?: string;
}

contextBridge.exposeInMainWorld("aerisEnroll", {
  submit: (input: EnrollInput) => ipcRenderer.invoke(ENROLL_CHANNELS.submit, input),
});
