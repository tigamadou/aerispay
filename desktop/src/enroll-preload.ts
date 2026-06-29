/**
 * Preload de la fenêtre d'enrôlement (locale). Expose UNIQUEMENT aerisEnroll —
 * jamais exposé à l'UI distante du nœud (fenêtre kiosque = preload séparé).
 */
import { contextBridge, ipcRenderer } from "electron";

// Preload SANDBOXÉ (sandbox:true) : require() d'un module LOCAL est interdit — seuls
// 'electron' et les built-ins Node sont requérables. On INLINE donc le canal (miroir de
// src/channels.ts → ENROLL_CHANNELS.submit). Importer "./channels" ici ferait planter le
// preload et `window.aerisEnroll` ne serait jamais exposé.
const ENROLL_SUBMIT = "aeris:enroll-submit";

export interface EnrollInput {
  nodeUrl: string;
  token: string;
  nom?: string;
}

contextBridge.exposeInMainWorld("aerisEnroll", {
  submit: (input: EnrollInput) => ipcRenderer.invoke(ENROLL_SUBMIT, input),
});
