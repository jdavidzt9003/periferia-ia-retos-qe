import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { ROOT,readJson,ensureDir,getPath,normalize,logLine,ok,fail,safeSlug } from "../src/shared.js";

const F=path.join(ROOT,"reto-01/fixtures/reto-01");
const OUT=path.join(ROOT,"out/reto-01");
const countryTax:Record<string,string>={CO:"NIT",EC:"RUC",PE:"RUC",PA:"RUC",HN:"RTN"};
function valueFor(label:string, maestro:any, glossary:any, pais:string){
 const key=glossary[label] || glossary[Object.keys(glossary).find(k=>normalize(k)===normalize(label))||""];
 if(!key)return {status:"requiere_confirmacion",value:null,source:null,note:"Etiqueta no encontrada en el glosario"};
 if(normalize(label).includes("identificaciontributaria")||normalize(label).includes("numerodeidentificacionfiscal")||["NIT","RUC","RTN"].includes(label.toUpperCase())){
   const val=getPath(maestro,key);
   return {status:pais==="CO"?"lleno":"requiere_confirmacion",value:val??null,source:key,note:pais==="CO"?null:"identificador extranjero: se usa el NIT colombiano como referencia; validar con el cliente"};
 }
 const val=getPath(maestro,key);
 return val===undefined||val===null||val===""?{status:"faltante",value:null,source:null,note:"No existe en el maestro"}:{status:"lleno",value:typeof val==="object"?JSON.stringify(val):val,source:key,note:null};
}
export async function proveedor_leer_solicitud(args:{caso:string}){
 try{
  const dir=path.join(F,"casos",args.caso); if(!fs.existsSync(dir))throw new Error(`Caso inexistente: ${args.caso}`);
  const solicitud=readJson(path.join(dir,"solicitud.json")); const supports=readJson<string[]>(path.join(dir,"soportes-exigidos.json"));
  const templateFile=solicitud.formato==="xlsx"?"plantilla-celdas.json":"plantilla-campos.json";
  const plantilla=readJson<any[]>(path.join(dir,templateFile));
  const maestro=readJson(path.join(F,"repositorio/maestro.json")); const glossary=readJson(path.join(F,"glosario-campos.json"));
  const campos=plantilla.map((p:any)=>({etiqueta:p.etiqueta,...valueFor(p.etiqueta,maestro,glossary,solicitud.pais),...("obligatorio" in p?{obligatorio:p.obligatorio}:{}),...("hoja" in p?{hoja:p.hoja,celda_etiqueta:p.celda_etiqueta,celda_valor:p.celda_valor}:{})}));
  const data={solicitud,formato:solicitud.formato,pais:solicitud.pais,tipo_identificador:countryTax[solicitud.pais]||"desconocido",campos,soportes_exigidos:supports};
  logLine(path.join(OUT,args.caso,"log.jsonl"),{herramienta:"proveedor_leer_solicitud",ok:true,resumen:`${campos.length} campos leídos`});
  return ok(data);
 }catch(e){return fail(e)}
}
export async function proveedor_generar_formulario(args:{caso:string}){
 try{
  const read=JSON.parse(await proveedor_leer_solicitud({caso:args.caso})); if(!read.ok)throw new Error(read.error);
  const {solicitud,formato,campos}=read.data; const out=path.join(OUT,args.caso);ensureDir(out);
  if(formato==="xlsx"){
   const wb=new ExcelJS.Workbook(); const sheets=new Map<string,ExcelJS.Worksheet>();
   for(const c of campos){let ws=sheets.get(c.hoja);if(!ws){ws=wb.addWorksheet(c.hoja);sheets.set(c.hoja,ws)}
    ws.getCell(c.celda_etiqueta).value=c.etiqueta;ws.getCell(c.celda_valor).value=c.value??"";}
   const dest=path.join(out,"formulario.xlsx");await wb.xlsx.writeFile(dest);
   return ok({ruta:dest,formato:"xlsx",campos:campos.length});
  }
  if(formato==="pdf"){
   const dest=path.join(out,"formulario.pdf"); await new Promise<void>((resolve,reject)=>{const doc=new PDFDocument({margin:50});const stream=fs.createWriteStream(dest);doc.pipe(stream);doc.fontSize(16).text("Formulario de calificación de proveedor",{underline:true});doc.moveDown();doc.fontSize(10).text(`Caso: ${args.caso} | País: ${solicitud.pais}`);doc.moveDown();for(const c of campos){doc.fontSize(10).fillColor("#333").text(`${c.etiqueta}${c.obligatorio?" *":""}`,{continued:true});doc.fillColor("#111").text(`  ${c.value??"[FALTANTE]"}`);doc.moveDown(0.5)}doc.end();stream.on("finish",()=>resolve());stream.on("error",reject)});
   return ok({ruta:dest,formato:"pdf",campos:campos.length});
  }
  const md=["# Valores listos para copiar en portal","",`Caso: ${args.caso}`,`Portal indicado por el cliente: ${solicitud.cuerpo.match(/https?:\/\/\S+/)?.[0]||"URL no identificada"}`,"","> El agente no inicia sesión ni envía formularios. El ingreso de credenciales y el clic final son humanos.","",...campos.map((c:any)=>`- **${c.etiqueta}:** ${c.value??"[FALTANTE]"}${c.status==="requiere_confirmacion"?" _(requiere confirmación)_":""}`)].join("\n");
  fs.writeFileSync(path.join(out,"valores-portal.md"),md);return ok({ruta:path.join(out,"valores-portal.md"),formato:"portal no soportado; valores preparados",campos:campos.length});
 }catch(e){return fail(e)}
}
export async function proveedor_armar_paquete(args:{caso:string,confirmado?:boolean}){
 try{
  const parsed=JSON.parse(await proveedor_leer_solicitud({caso:args.caso}));if(!parsed.ok)throw new Error(parsed.error);
  const {solicitud,campos,soportes_exigidos}=parsed.data;const root=path.join(OUT,args.caso);ensureDir(root);
  const form=JSON.parse(await proveedor_generar_formulario({caso:args.caso}));if(!form.ok)throw new Error(form.error);
  const idx=readJson<any[]>(path.join(F,"repositorio/soportes/index.json"));const supportDir=path.join(F,"repositorio/soportes");const pack=path.join(root,"paquete");ensureDir(pack);
  const today=process.env.DEMO_MODE==="1"?"2026-10-27":new Date().toISOString().slice(0,10);const checklist:string[]=["# Checklist de soportes","",`Fecha de evaluación: ${today}`,""];
  let blocked=false;
  for(const type of soportes_exigidos){const item=idx.find((x:any)=>x.tipo===type);if(!item||!fs.existsSync(path.join(supportDir,item?.archivo||"__missing__"))){checklist.push(`- [ ] **${type}** — AUSENTE`);blocked=true;continue}
   const expired=item.vigencia_hasta&&item.vigencia_hasta<today;checklist.push(`- [${expired?" ":"x"}] **${type}** — ${expired?"VENCIDO": "PRESENTE"}${item.vigencia_hasta?` (vigencia hasta ${item.vigencia_hasta})`:""}`);
   if(expired)blocked=true;fs.copyFileSync(path.join(supportDir,item.archivo),path.join(pack,item.archivo));
  }
  const missing=campos.filter((c:any)=>c.status!=="lleno");
  checklist.push("", "## Campos",...missing.map((c:any)=>`- ${c.etiqueta}: ${c.status}${c.note?` — ${c.note}`:""}`));
  checklist.push("",`## Estado: ${blocked?"NO LISTO PARA FIRMA":"LISTO PARA FIRMA"}`);
  fs.writeFileSync(path.join(pack,"checklist.md"),checklist.join("\n"));
  const formSrc=path.join(root,form.data.formato==="xlsx"?"formulario.xlsx":form.data.formato==="pdf"?"formulario.pdf":"valores-portal.md");
  if(fs.existsSync(formSrc))fs.copyFileSync(formSrc,path.join(pack,path.basename(formSrc)));
  const maestro=readJson(path.join(F,"repositorio/maestro.json"));
  // Deliberately omit all banking fields from email draft.
  const draft=`# Borrador de correo\n\n**Para:** ${solicitud.de}\n**Asunto:** Registro de proveedor — ${maestro.razon_social}\n\nBuen día,\n\nAdjuntamos el formulario diligenciado y los soportes disponibles para continuar el proceso de registro como proveedor.\n\nQuedan pendientes de validar los siguientes puntos: ${missing.length?missing.map((c:any)=>c.etiqueta).join(", "):"ninguno"}. ${blocked?"El paquete no está listo para firma porque hay soportes ausentes o vencidos.":"Por favor validar el paquete antes de remitirlo a firma."}\n\nCordialmente,\nPeriferia IT Group S.A.S.`;
  fs.writeFileSync(path.join(pack,"borrador-correo.md"),draft);
  const result={caso:args.caso,listo_para_firma:!blocked,soportes_exigidos:soportes_exigidos.length,campos_pendientes:missing.length,paquete:pack,confirmacion_requerida:true};
  if(args.confirmado===true&&!blocked){fs.writeFileSync(path.join(root,"ENVIO-SIMULADO.md"),`# Envío simulado\n\nCaso: ${args.caso}\nConfirmación humana recibida: sí\nFecha: ${new Date().toISOString()}\nEstado del paquete: ${result.listo_para_firma?"listo_para_firma":"bloqueado por soportes"}\n\nNo se realizó ningún envío externo.`)}
  logLine(path.join(root,"log.jsonl"),{herramienta:"proveedor_armar_paquete",ok:true,resumen:`paquete ${result.listo_para_firma?"listo":"bloqueado"}`});
  return ok(result);
 }catch(e){return fail(e)}
}
export const proveedor_tools={proveedor_leer_solicitud,proveedor_generar_formulario,proveedor_armar_paquete};
