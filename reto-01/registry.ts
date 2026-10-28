import {z} from "zod";import {proveedor_leer_solicitud,proveedor_generar_formulario,proveedor_armar_paquete} from "./tools.js";
export const tools={
 proveedor_leer_solicitud:{description:"Lee la solicitud, la plantilla, el glosario y el maestro para mapear los campos solicitados.",args:{caso:z.string().describe("Carpeta del caso en fixtures/reto-01/casos")},execute:proveedor_leer_solicitud},
 proveedor_generar_formulario:{description:"Genera el formulario en Excel, PDF o valores listos para copiar en un portal.",args:{caso:z.string().describe("Carpeta del caso en fixtures/reto-01/casos")},execute:proveedor_generar_formulario},
 proveedor_armar_paquete:{description:"Copia soportes disponibles, evalúa vigencias y genera checklist y borrador de correo.",args:{caso:z.string().describe("Carpeta del caso"),confirmado:z.boolean().optional().describe("Confirmación humana explícita para registrar envío simulado")},execute:proveedor_armar_paquete}
};
