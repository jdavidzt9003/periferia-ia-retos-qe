/** Contrato del proveedor de LLM. Un proveedor alternativo solo debe implementar completar(). */
export interface LlmAdapter {
  completar(mensajes: unknown[], herramientas: unknown[]): Promise<any>;
}
