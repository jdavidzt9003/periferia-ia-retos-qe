import {z} from "zod";import {oc_leer_paquete,oc_validar,oc_construir_payload,oc_generar_evidencia,oc_crear} from "./tools.js";
export const tools={
 oc_leer_paquete:{description:"Lee y normaliza correo, solicitud, cotización, aprobación y factura si existe.",args:{caso:z.string().describe("Carpeta sol-001 a sol-006")},execute:oc_leer_paquete},
 oc_validar:{description:"Aplica reglas de control de proveedor, aprobación, centro de costo, monto, cotización e impuestos.",args:{caso:z.string().describe("Carpeta de solicitud"),paquete:z.any().optional().describe("Paquete normalizado")},execute:oc_validar},
 oc_construir_payload:{description:"Construye el payload tipado de la orden de compra y genera trazabilidad.",args:{caso:z.string().describe("Carpeta de solicitud"),paquete:z.any().optional().describe("Paquete normalizado"),derivados:z.any().optional().describe("Valores derivados desde maestros")},execute:oc_construir_payload},
 oc_generar_evidencia:{description:"Genera la evidencia de aprobación en TXT con SHA-256 y PDF.",args:{caso:z.string().describe("Carpeta de solicitud")},execute:oc_generar_evidencia},
 oc_crear:{description:"Crea una orden de compra en SAP simulado si no hay bloqueos y se han resuelto confirmaciones.",args:{caso:z.string().describe("Carpeta de solicitud"),payload:z.any().optional().describe("Payload validado"),confirmado:z.boolean().optional().describe("Confirmación explícita del usuario")},execute:oc_crear}
};
