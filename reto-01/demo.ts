import fs from "node:fs";import path from "node:path";import {ROOT} from "../src/shared.js";import {proveedor_leer_solicitud,proveedor_generar_formulario,proveedor_armar_paquete} from "./tools.js";
process.env.DEMO_MODE="1";
const out=path.join(ROOT,"out/reto-01");fs.rmSync(out,{recursive:true,force:true});
for(const caso of ["co-industrias-delta","ec-corp-andina","hn-agroexport-sula","pa-logistica-istmo"]){
 const a=JSON.parse(await proveedor_leer_solicitud({caso}));const f=JSON.parse(await proveedor_generar_formulario({caso}));const p=JSON.parse(await proveedor_armar_paquete({caso}));
 console.log(JSON.stringify({caso,ok:a.ok,formato:a.data?.formato,campos:a.data?.campos?.length,formulario:f.data?.ruta,paquete:{listo_para_firma:p.data?.listo_para_firma,confirmacion_requerida:p.data?.confirmacion_requerida},error:a.error||f.error||p.error},null,2));
}
