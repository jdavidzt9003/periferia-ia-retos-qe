import fs from "node:fs";
import path from "node:path";
import {ROOT,readJson,ensureDir,parseCsv,toCsv,logLine,ok,fail,safeSlug} from "../src/shared.js";
const F=path.join(ROOT,"reto-02/fixtures/reto-02"), OUT=path.join(ROOT,"out/reto-02");
const headers=["id_contrato","cliente","nit_cliente","pais","objeto","valor","moneda","fecha_inicio","fecha_fin","requiere_poliza","tipo_poliza","estado_poliza","comercial","ruta_sharepoint","fecha_registro","fuente"];
function allMessages(){return fs.readdirSync(path.join(F,"buzon")).filter(x=>x.startsWith("msg-")).sort().map(id=>({id,dir:path.join(F,"buzon",id),correo:readJson(path.join(F,"buzon",id,"correo.json"))}));}
function maestroRows(){
 const src=path.join(F,"maestro-contratos.csv"),dest=path.join(OUT,"sharepoint/maestro-contratos.csv");ensureDir(path.dirname(dest));if(!fs.existsSync(dest))fs.copyFileSync(src,dest);
 const rows=parseCsv(fs.readFileSync(dest,"utf8"));return {dest,rows:rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""]))),raw:rows};
}
function textFor(m:any){const att=m.correo.adjuntos.find((x:string)=>/contrato|otrosi/i.test(x));return att&&fs.existsSync(path.join(m.dir,att))?fs.readFileSync(path.join(m.dir,att),"utf8"):null;}
function getDate(text:string,kind:"inicio"|"fin"|"firma"){
 const iso=text.match(new RegExp(kind==="inicio"?"desde[^\\n]{0,80}?\\(?([0-9]{1,2})\\)? de ([a-záéíóú]+) de (\\d{4})":kind==="fin"?"hasta[^\\n]{0,100}?(?:el )?\\(?([0-9]{1,2})\\)? de ([a-záéíóú]+) de (\\d{4})":"se firma[^\\n]{0,80}?\\(?([0-9]{1,2})\\)? de ([a-záéíóú]+) de (\\d{4})","i"));
 if(!iso)return null;const months:Record<string,string>={enero:"01",febrero:"02",marzo:"03",abril:"04",mayo:"05",junio:"06",julio:"07",agosto:"08",septiembre:"09",octubre:"10",noviembre:"11",diciembre:"12"};const mo=months[iso[2].toLowerCase()];return mo?`${iso[3]}-${mo}-${iso[1].padStart(2,"0")}`:null;
}
function extract(m:any){
 const text=textFor(m); if(!text)return {error:"No se encontró adjunto de contrato"};
 const email=m.correo.de;
 const id=text.match(/(?:CONTRATO(?: MARCO)?(?: DE PRESTACIÓN DE SERVICIOS)?|CONTRATO No\.?|CONTRATO DE PRESTACIÓN DE SERVICIOS No\.?|AL CONTRATO[^\\n]* No\.?)\s*(?:No\.?\s*)?([A-Z]{1,4}-\d{4}-\d{2,3})/i)?.[1]||text.match(/No\. (CT-\d{4}-\d+)/i)?.[1]||"";
 const client=(text.match(/(?:Entre los suscritos,?\s*)([^,]+),\s*identificada/i)||text.match(/Entre\s+([^,]+),\s*identificada/i))?.[1]?.trim()||"";
 const nit=(text.match(/(?:NIT|RUC)\s*([\d.]+-\d|\d{10,})/i)||[])[1]?.replace(/\D/g,"")||"";
 const pais=/RUC 179|Ecuador|Quito/i.test(text)?"EC":/RUC 205|Perú|Peru|Lima/i.test(text)?"PE":/Panamá|Panama/i.test(text)?"PA":/Honduras/i.test(text)?"HN":"CO";
 const obj=(text.match(/PRIMERA\. OBJETO\.\s*([\s\S]*?)(?=\n\nSEGUNDA\.)/i)||[])[1]?.replace(/\s+/g," ").trim()||"";
 const money=text.match(/\((COP|USD|PEN|PAB|HNL)\s*\$?\s*([\d.,]+)\)/i);
 let value=money?Number(money[2].replace(/,/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"")):null;
 const currency=money?.[1]?.toUpperCase()||(pais==="EC"?"USD":pais==="PE"?"PEN":"COP");
 if(/no tiene un valor determinado/i.test(text)){value=0}
 let start=getDate(text,"inicio");let end=getDate(text,"fin");
 if(!end){const duration=text.match(/duración de (\d{1,2}) \(?([a-záéíóú]+)?\)? meses/i);if(duration&&start){const d=new Date(start+"T00:00:00Z");d.setUTCMonth(d.getUTCMonth()+Number(duration[1]));d.setUTCDate(d.getUTCDate()-1);end=d.toISOString().slice(0,10)}}
 const needs=/póliza/i.test(text),policy=/póliza de ([a-záéíóú ]+)/i.exec(text)?.[1]?.trim()||"";
 const otheri=/OTROSÍ/i.test(text);
 let finalObj=obj;let existingRow:any=null;
 if(otheri&&id){try{const masterText=fs.readFileSync(path.join(F,"maestro-contratos.csv"),"utf8");const rows=parseCsv(masterText);const h=rows[0];const ix=h.indexOf("id_contrato");const row=rows.slice(1).find(r=>r[ix]===id);if(row){existingRow=Object.fromEntries(h.map((k,i)=>[k,row[i]||""]));if(!finalObj)finalObj=existingRow.objeto||"";if(!start)start=existingRow.fecha_inicio||null;}}catch{}}
 const valid=Boolean(client&&finalObj);
 const conf:any={id_contrato:id?0.99:0,cliente:client?0.95:0,nit_cliente:nit?0.9:0,pais:0.9,objeto:finalObj?0.9:0,valor:value===null?0:/no tiene un valor determinado/i.test(text)?0.55:0.9,moneda:0.9,fecha_inicio:start?0.9:0,fecha_fin:end?0.9:0,requiere_poliza:0.95,tipo_poliza:policy?0.85:0.5};
 return {id_contrato:id||null,cliente:client||null,nit_cliente:nit||null,pais,objeto:finalObj||null,valor:value,moneda:currency,fecha_inicio:start,fecha_fin:end,requiere_poliza:needs,tipo_poliza:policy,estado_poliza:needs?"pendiente":"no_aplica",comercial:null,confianza:conf,es_otrosi:otheri,identificable:valid, texto:text};
}
export async function contratos_leer_buzon(_args?:{}){
 try{const processed=fs.existsSync(path.join(OUT,"procesados.json"))?readJson<string[]>(path.join(OUT,"procesados.json")):[];const mensajes=allMessages().filter(m=>!processed.includes(m.id)).map(m=>({id:m.id,de:m.correo.de,asunto:m.correo.asunto,fecha:m.correo.fecha,adjuntos:m.correo.adjuntos,tiene_contrato:Boolean(textFor(m))}));logLine(path.join(OUT,"log.jsonl"),{herramienta:"contratos_leer_buzon",mensaje_id:null,ok:true,resumen:`${mensajes.length} mensajes pendientes`});return ok({mensajes})}catch(e){return fail(e)}
}
export async function contratos_extraer(args:{mensaje_id:string}){
 try{const m=allMessages().find(x=>x.id===args.mensaje_id);if(!m)throw new Error(`Mensaje inexistente: ${args.mensaje_id}`);const data=extract(m);if(data.error)throw new Error(data.error);return ok(data)}catch(e){return fail(e)}
}
export async function contratos_validar(args:{mensaje_id:string,contrato?:any}){
 try{
  const m=allMessages().find(x=>x.id===args.mensaje_id);if(!m)throw new Error("Mensaje inexistente");
  const c=args.contrato||extract(m);const {rows}=maestroRows();const review=Object.entries(c.confianza||{}).filter(([_,v]:any)=>v<0.8).map(([k])=>k);
  if(!c.identificable)return ok({clasificacion:"rechazado",motivo:"No hay contrato adjunto o no se identifican partes y objeto",requiere_revision:[]});
  const existing=rows.find(r=>r.id_contrato===c.id_contrato);
  if(existing){
   const identical=String(existing.valor)===String(c.valor)&&existing.fecha_inicio===c.fecha_inicio&&existing.fecha_fin===c.fecha_fin&&!c.es_otrosi;
   return ok({clasificacion:identical?"duplicado":"actualizacion",id_contrato_existente:c.id_contrato,requiere_revision:review,diferencias:Object.fromEntries(["valor","fecha_inicio","fecha_fin","objeto"].filter(k=>String(existing[k]??"")!==String(c[k]??"").trim()).map(k=>[k,{actual:existing[k],nuevo:c[k]}]))});
  }
  const same=rows.find(r=>r.nit_cliente===c.nit_cliente&&String(r.objeto).toLowerCase()===String(c.objeto).toLowerCase());
  if(same)return ok({clasificacion:"actualizacion",id_contrato_existente:same.id_contrato,requiere_revision:review,diferencias:{objeto:{actual:same.objeto,nuevo:c.objeto}}});
  return ok({clasificacion:"nuevo",requiere_revision:review,comercial_resuelto:readJson<any[]>(path.join(F,"comerciales.json")).find(x=>x.email===m.correo.de)?.nombre||null,remitente_desconocido:!readJson<any[]>(path.join(F,"comerciales.json")).some(x=>x.email===m.correo.de)});
 }catch(e){return fail(e)}
}
export async function contratos_registrar(args:{mensaje_id:string,contrato?:any,confirmado?:boolean}){
 try{
  const m=allMessages().find(x=>x.id===args.mensaje_id);if(!m)throw new Error("Mensaje inexistente");
  const c=args.contrato||extract(m);const validation=JSON.parse(await contratos_validar({mensaje_id:args.mensaje_id,contrato:c}));if(!validation.ok)throw new Error(validation.error);const v=validation.data;
  if(v.clasificacion==="rechazado"||v.clasificacion==="duplicado"){return ok({id_contrato:c.id_contrato,accion:v.clasificacion,ruta_archivo:null,motivo:v.motivo||"Sin escritura para duplicado"})}
  if(v.requiere_revision?.length&&!args.confirmado)return fail(`requiere revisión: ${v.requiere_revision.join(", ")}. Confirma explícitamente para registrar.`);
  const {dest,rows}=maestroRows();const commercial=readJson<any[]>(path.join(F,"comerciales.json")).find(x=>x.email===m.correo.de)?.nombre||"Remitente no registrado";
  const id=c.id_contrato||`AUTO-${(c.fecha_inicio||"2026").slice(0,4)}-${String(rows.length+1).padStart(3,"0")}`;
  const folder=path.join(OUT,"sharepoint/Contratos",String((c.fecha_inicio||"2026").slice(0,4)),safeSlug(c.cliente||"cliente"));ensureDir(folder);
  const source=textFor(m);const ext=m.correo.adjuntos[0]?.toLowerCase().includes("pdf")?".pdf":".txt";const filename=`${id}${ext}`;fs.writeFileSync(path.join(folder,filename),source||"");
  const ruta=`Contratos/${String((c.fecha_inicio||"2026").slice(0,4))}/${safeSlug(c.cliente||"cliente")}/${filename}`;
  const row:any={id_contrato:id,cliente:c.cliente,nit_cliente:c.nit_cliente,pais:c.pais,objeto:String(c.objeto||"").slice(0,200),valor:c.valor??0,moneda:c.moneda,fecha_inicio:c.fecha_inicio||"",fecha_fin:c.fecha_fin||"",requiere_poliza:String(Boolean(c.requiere_poliza)),tipo_poliza:c.tipo_poliza||"",estado_poliza:c.requiere_poliza?"pendiente":"no_aplica",comercial:commercial, ruta_sharepoint:ruta,fecha_registro:process.env.DEMO_MODE==="1"?"2026-08-31":new Date().toISOString().slice(0,10),fuente:"buzon"};
  const existingIndex=rows.findIndex(r=>r.id_contrato===v.id_contrato_existente);const newRows=existingIndex>=0?rows.map((r,i)=>{if(i!==existingIndex)return r;if(c.es_otrosi)return {...r,valor:row.valor,moneda:row.moneda,fecha_fin:row.fecha_fin||r.fecha_fin,ruta_sharepoint:ruta,fecha_registro:row.fecha_registro,fuente:"buzon"};return {...r,...Object.fromEntries(Object.entries(row).filter(([k,v])=>v!==null&&v!==undefined&&v!=="")),id_contrato:r.id_contrato}}):[...rows,row];
  fs.writeFileSync(dest,toCsv([headers,...newRows.map(r=>headers.map(h=>r[h]))]));
  const hist=path.join(OUT,"sharepoint/historial.jsonl");logLine(hist,{id_contrato:id,accion:v.clasificacion,cambios:v.diferencias||{},mensaje_id:args.mensaje_id});
  const procFile=path.join(OUT,"procesados.json");const proc=fs.existsSync(procFile)?readJson<string[]>(procFile):[];if(!proc.includes(args.mensaje_id))proc.push(args.mensaje_id);fs.writeFileSync(procFile,JSON.stringify(proc,null,2));
  logLine(path.join(OUT,"log.jsonl"),{herramienta:"contratos_registrar",mensaje_id:args.mensaje_id,ok:true,resumen:`${v.clasificacion}: ${id}`});
  return ok({id_contrato:id,accion:v.clasificacion,ruta_archivo:ruta});
 }catch(e){return fail(e)}
}
export async function contratos_alertas(args:{hoy:string}){
 try{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(args.hoy)||Number.isNaN(Date.parse(args.hoy)))throw new Error("hoy debe tener formato YYYY-MM-DD");
  const {rows}=maestroRows();const now=new Date(args.hoy+"T00:00:00Z");const cutoff=new Date(now);cutoff.setUTCDate(cutoff.getUTCDate()+60);
  const vence=rows.filter(r=>r.fecha_fin&&r.fecha_fin>=args.hoy&&r.fecha_fin<=cutoff.toISOString().slice(0,10));
  const policies=rows.filter(r=>r.requiere_poliza==="true"&&r.estado_poliza!=="vigente");
  const recent=rows.filter(r=>r.fecha_registro>="2026-05-30");
  const md=`# Alertas de contratos\n\nFecha de referencia: ${args.hoy}\n\n## Vencen en ≤ 60 días\n${vence.length?vence.map(r=>`- ${r.id_contrato} — ${r.cliente} — ${r.fecha_fin}`).join("\n"):"- Sin contratos en esta condición"}\n\n## Póliza requerida no vigente\n${policies.length?policies.map(r=>`- ${r.id_contrato} — ${r.cliente} — ${r.estado_poliza}`).join("\n"):"- Sin contratos en esta condición"}\n\n## Registrados desde 2026-05-30\n${recent.length?recent.map(r=>`- ${r.id_contrato} — ${r.cliente} — ${r.fecha_registro}`).join("\n"):"- Sin contratos en esta condición"}\n`;
  ensureDir(OUT);fs.writeFileSync(path.join(OUT,"alertas.md"),md);logLine(path.join(OUT,"log.jsonl"),{herramienta:"contratos_alertas",mensaje_id:null,ok:true,resumen:"reporte generado"});return ok({ruta:path.join(OUT,"alertas.md"),vencen:vence,polizas_pendientes:policies,registrados_desde_corte:recent});
 }catch(e){return fail(e)}
}
export const contratos_tools={contratos_leer_buzon,contratos_extraer,contratos_validar,contratos_registrar,contratos_alertas};
