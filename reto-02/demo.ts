import fs from "node:fs";
import path from "node:path";
import {ROOT} from "../src/shared.js";
import {contratos_leer_buzon,contratos_extraer,contratos_validar,contratos_registrar,contratos_alertas} from "./tools.js";


process.env.DEMO_MODE="1";
fs.rmSync(path.join(ROOT,"out/reto-02"),{recursive:true,force:true});
const inbox=JSON.parse(await contratos_leer_buzon({}));console.log("Buzón:",inbox.data.mensajes.length,"mensajes");
for(const m of inbox.data.mensajes){
 const extracted=JSON.parse(await contratos_extraer({mensaje_id:m.id}));
 if(!extracted.ok){console.log(m.id,"error",extracted.error);continue}
 const validation=JSON.parse(await contratos_validar({mensaje_id:m.id,contrato:extracted.data}));
 let reg:any=null;if(["nuevo","actualizacion"].includes(validation.data?.clasificacion)){
  reg=JSON.parse(await contratos_registrar({mensaje_id:m.id,contrato:extracted.data,confirmado:validation.data.requiere_revision.length===0}));
 }
 console.log(JSON.stringify({mensaje:m.id,clasificacion:validation.data?.clasificacion,revision:validation.data?.requiere_revision,registro:reg?.data||reg?.error},null,2));
}
const alerts=JSON.parse(await contratos_alertas({hoy:"2026-10-27"}));console.log("Alertas generadas:",alerts.data?.ruta||alerts.error);
