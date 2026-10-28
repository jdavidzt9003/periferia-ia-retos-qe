import {z} from "zod";import {contratos_leer_buzon,contratos_extraer,contratos_validar,contratos_registrar,contratos_alertas} from "./tools.js";
export const tools={
 contratos_leer_buzon:{description:"Lista los mensajes del buzón que aún no se han procesado.",args:{},execute:contratos_leer_buzon},
 contratos_extraer:{description:"Extrae campos de un contrato con nivel de confianza por campo.",args:{mensaje_id:z.string().describe("Identificador msg-001 a msg-006")},execute:contratos_extraer},
 contratos_validar:{description:"Clasifica el contrato contra el maestro y devuelve campos que requieren revisión.",args:{mensaje_id:z.string().describe("Identificador del mensaje"),contrato:z.any().optional().describe("Contrato extraído previamente")},execute:contratos_validar},
 contratos_registrar:{description:"Registra un contrato nuevo o actualiza uno existente cuando no hay revisión pendiente o se confirma.",args:{mensaje_id:z.string().describe("Identificador del mensaje"),contrato:z.any().optional().describe("Contrato extraído previamente"),confirmado:z.boolean().optional().describe("Confirmación explícita para resolver campos de baja confianza")},execute:contratos_registrar},
 contratos_alertas:{description:"Genera reporte de vencimientos, pólizas no vigentes y contratos desde la fecha de corte.",args:{hoy:z.string().describe("Fecha de referencia YYYY-MM-DD")},execute:contratos_alertas}
};
