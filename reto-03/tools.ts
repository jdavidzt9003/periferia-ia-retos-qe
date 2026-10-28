import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import {z} from "zod";
import {ROOT,readJson,ensureDir,logLine,ok,fail,sha256,toCsv} from "../src/shared.js";
const F=path.join(ROOT,"reto-03/fixtures/reto-03"),OUT=path.join(ROOT,"out/reto-03");
const OrdenSchema=z.object({
 referencia:z.object({solicitud_id:z.string(),correo_id:z.string(),cotizacion_ref:z.string().nullable()}),
 sociedad:z.literal("1000"),organizacion_compras:z.literal("1000"),
 proveedor:z.object({codigo_sap:z.string(),nit:z.string(),nombre:z.string()}),
 moneda:z.enum(["COP","USD"]),condiciones_pago:z.string(),
 aprobador:z.object({email:z.string(),fecha_aprobacion:z.string(),evidencia_sha256:z.string()}),
 posiciones:z.array(z.object({numero:z.number(),descripcion:z.string().max(40),cantidad:z.number().positive(),unidad:z.enum(["UN","H","MES"]),precio_unitario:z.number().nonnegative(),centro_costo:z.string(),subarea:z.string(),indicador_iva:z.string()})),
 excepciones:z.array(z.object({codigo:z.string(),detalle:z.string(),confirmado_por:z.string().nullable()}))
});
type OrdenCompra=z.infer<typeof OrdenSchema>;
function caseDir(caso:string){const d=path.join(F,"solicitudes",caso);if(!fs.existsSync(d))throw new Error(`Caso inexistente: ${caso}`);return d}
function parseQuote(text:string){const currency=(text.match(/\b(COP|USD|PEN|PAB|HNL)\b/)||[])[1]||"COP";const m=text.match(/TOTAL(?:\s*\(IVA incluido\))?\s*:\s*(?:COP|USD|PEN|PAB|HNL)?\s*\$?\s*([\d.,]+)/i)||text.match(/(?:Valor total estimado|Total cotización|Total)\s*:\s*(?:COP|USD|PEN|PAB|HNL)?\s*\$?\s*([\d.,]+)/i)||text.match(/(?:Total|Valor total)[^\n]{0,50}([\d.,]+)/i);let total=m?Number(m[1].replace(/,/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"")):null;return {proveedor:(text.match(/Proveedor:\s*(.+)/i)||[])[1]?.trim()||"",nit:(text.match(/NIT:\s*([\d.-]+)/i)||[])[1]?.replace(/\D/g,"")||null,total,moneda:currency,validez_hasta:(text.match(/Validez(?: de la oferta)?:\s*(.+)/i)||[])[1]?.trim()||null,texto:text}}
export async function oc_leer_paquete(args:{caso:string}){
 try{
  const d=caseDir(args.caso);const correo=readJson(path.join(d,"correo.json"));const solicitud=readJson(path.join(d,"solicitud.json"));
  const cotPath=path.join(d,"cotizacion.txt"),apPath=path.join(d,"aprobacion.json"),factPath=path.join(d,"factura.txt");
  const cotizacion=fs.existsSync(cotPath)?parseQuote(fs.readFileSync(cotPath,"utf8")):null;
  let aprobacion:any=null;if(fs.existsSync(apPath)){const a=readJson(apPath);aprobacion={de:a.de,para:a.para,fecha:a.fecha,asunto:a.asunto,aprobado:/\baprobado\b/i.test(a.cuerpo),texto:a.cuerpo}}
  let factura:any=null;if(fs.existsSync(factPath)){const text=fs.readFileSync(factPath,"utf8");factura={numero:(text.match(/(?:Factura|No\.)\s*[:#]?\s*([A-Z0-9-]+)/i)||[])[1]||"desconocido",fecha:(text.match(/(\d{4}-\d{2}-\d{2})/)||[])[1]||null,total:Number((text.match(/(?:Total|Valor total)[^\d]*([\d.,]+)/i)||[])[1]?.replace(/,/g,"")||0)}}
  const missing=["solicitud.json","cotizacion.txt","aprobacion.json"].filter(n=>!fs.existsSync(path.join(d,n)));
  return ok({correo,solicitud,cotizacion,aprobacion,factura,adjuntos_faltantes:missing});
 }catch(e){return fail(e)}
}
function masters(){return {proveedores:readJson<any[]>(path.join(F,"maestros/proveedores.json")),centros:readJson<any[]>(path.join(F,"maestros/centros-costo.json")),iva:readJson<any[]>(path.join(F,"maestros/indicadores-iva.json")),pagos:readJson<any[]>(path.join(F,"maestros/condiciones-pago.json"))}}
export async function oc_validar(args:{caso:string,paquete?:any}){
 try{
  const raw=args.paquete?{ok:true,data:args.paquete}:JSON.parse(await oc_leer_paquete({caso:args.caso}));if(!raw.ok)throw new Error(raw.error);
  const p=raw.data,s=p.solicitud,m=masters();const bloqueos:string[]=[],confirmaciones:string[]=[],derivados:any={};
  const provider=m.proveedores.find(x=>s.proveedor_nit?x.nit===String(s.proveedor_nit).replace(/\D/g,""):x.nombre.toLowerCase()===String(s.proveedor_nombre).toLowerCase());
  if(!provider||!provider.activo)bloqueos.push(provider?"El proveedor existe pero está inactivo":"Proveedor inexistente en el maestro");
  const cc=m.centros.find(x=>x.centro_costo===s.centro_costo);const approver=cc?.aprobadores.find((x:any)=>x.email.toLowerCase()===String(p.aprobacion?.de||"").toLowerCase());
  if(!p.aprobacion||!p.aprobacion.aprobado||!approver)bloqueos.push("Aprobación ausente, sin palabra 'Aprobado' o remitente no autorizado para el centro de costo");
  else if(Number(s.valor_total)>Number(approver.tope))bloqueos.push(`Monto ${s.valor_total} supera tope de aprobación ${approver.tope}`);
  if(!cc||!cc.subareas.includes(s.subarea))bloqueos.push("La subárea no pertenece al centro de costo");
  if(!Number.isFinite(Number(s.valor_total)))bloqueos.push("El monto total no es numérico");
  if(Math.abs(Number(s.cantidad)*Number(s.valor_unitario)-Number(s.valor_total))>1)bloqueos.push("Cantidad × valor unitario no coincide con el total (tolerancia ±1)");
  if(p.cotizacion){if(p.cotizacion.total===null||!Number.isFinite(Number(p.cotizacion.total)))confirmaciones.push("No se pudo leer el total de la cotización; confirmar monto");else if(Number(s.valor_total)>0&&Math.abs(Number(p.cotizacion.total)-Number(s.valor_total))/Number(s.valor_total)>0.02)confirmaciones.push(`Cotización (${p.cotizacion.total} ${p.cotizacion.moneda}) difiere de solicitud (${s.valor_total} ${s.moneda}) en más del 2 %`)}else confirmaciones.push("No hay cotización adjunta; confirmar creación sin cotización");
  if(!s.indicador_iva&&provider){derivados.indicador_iva=provider.indicador_iva_default;confirmaciones.push(`IVA no informado; se propone ${provider.indicador_iva_default} (${m.iva.find(x=>x.codigo===provider.indicador_iva_default)?.descripcion||"maestro proveedor"})`)}
  if(!s.condiciones_pago&&provider)derivados.condiciones_pago=provider.condiciones_pago_default;
  if(s.indicador_iva&&!m.iva.some(x=>x.codigo===s.indicador_iva))bloqueos.push(`Indicador IVA desconocido: ${s.indicador_iva}`);
  if(s.condiciones_pago&&!m.pagos.some(x=>x.codigo===s.condiciones_pago))bloqueos.push(`Condición de pago desconocida: ${s.condiciones_pago}`);
  const retroactiva=Boolean(p.factura?.fecha&&p.factura.fecha<s.fecha_solicitud);if(retroactiva)confirmaciones.push(`Factura ${p.factura.numero} (${p.factura.fecha}) anterior a la solicitud (${s.fecha_solicitud}): OC retroactiva`);
  if(p.aprobacion?.fecha&&p.aprobacion.fecha.slice(0,10)<s.fecha_solicitud)confirmaciones.push("La aprobación es anterior a la fecha de solicitud");
  return ok({apta:bloqueos.length===0,bloqueos,confirmaciones,derivados,retroactiva,proveedor:provider,centro_costo:cc,aprobador:approver||null});
 }catch(e){return fail(e)}
}
export async function oc_generar_evidencia(args:{caso:string}){
 try{const d=caseDir(args.caso);const a=readJson(path.join(d,"aprobacion.json"));const content=`De: ${a.de}\nPara: ${a.para}\nFecha: ${a.fecha}\nAsunto: ${a.asunto}\n\n${a.cuerpo}\n`;const out=path.join(OUT,args.caso);ensureDir(out);const hash=sha256(content);const txt=path.join(out,"aprobacion.txt");fs.writeFileSync(txt,content+`\nSHA256: ${hash}\n`);
  const pdf=path.join(out,"aprobacion.pdf");await new Promise<void>((resolve,reject)=>{const doc=new PDFDocument({margin:50});const stream=fs.createWriteStream(pdf);doc.pipe(stream);doc.fontSize(16).text("Evidencia de aprobación",{underline:true});doc.moveDown();doc.fontSize(10).text(content);doc.moveDown();doc.text(`SHA256: ${hash}`);doc.end();stream.on("finish",()=>resolve());stream.on("error",reject)});
  return ok({ruta:txt,ruta_pdf:pdf,sha256:hash});
 }catch(e){return fail(e)}
}
export async function oc_construir_payload(args:{caso:string,paquete?:any,derivados?:any}){
 try{const raw=args.paquete?{ok:true,data:args.paquete}:JSON.parse(await oc_leer_paquete({caso:args.caso}));if(!raw.ok)throw new Error(raw.error);const p=raw.data,s=p.solicitud;const val=JSON.parse(await oc_validar({caso:args.caso,paquete:p}));if(!val.ok)throw new Error(val.error);
  const ev=JSON.parse(await oc_generar_evidencia({caso:args.caso}));if(!ev.ok)throw new Error(ev.error);
  const v=val.data,provider=v.proveedor;if(!provider)throw new Error("No se puede construir payload sin proveedor válido");
  const payload:OrdenCompra={referencia:{solicitud_id:s.solicitud_id,correo_id:p.correo.id,cotizacion_ref:p.cotizacion?`cotizacion-${args.caso}`:null},sociedad:"1000",organizacion_compras:"1000",proveedor:{codigo_sap:provider.codigo_sap,nit:provider.nit,nombre:provider.nombre},moneda:s.moneda,condiciones_pago:s.condiciones_pago||args.derivados?.condiciones_pago||provider.condiciones_pago_default,aprobador:{email:p.aprobacion?.de||"",fecha_aprobacion:p.aprobacion?.fecha||"",evidencia_sha256:ev.data.sha256},posiciones:[{numero:10,descripcion:String(s.descripcion).slice(0,40),cantidad:Number(s.cantidad),unidad:/hora/i.test(s.descripcion)?"H":"UN",precio_unitario:Number(s.valor_unitario),centro_costo:s.centro_costo,subarea:s.subarea,indicador_iva:s.indicador_iva||args.derivados?.indicador_iva||provider.indicador_iva_default}],excepciones:[...v.confirmaciones.map((x:string)=>({codigo:"CONFIRMACION",detalle:x,confirmado_por:null}))]};
  const parsed=OrdenSchema.safeParse(payload);if(!parsed.success)throw new Error(`Payload inválido: ${parsed.error.message}`);
  const out=path.join(OUT,args.caso);ensureDir(out);const trace=Object.fromEntries(Object.entries(payload).map(([k,val])=>[k,{valor:val,fuente:k==="proveedor"?"maestro.proveedores":k==="aprobador"?"aprobacion + evidencia":k==="posiciones"?"solicitud + maestro + derivado":k==="referencia"?"correo + solicitud":"regla fija/derivado"}]));fs.writeFileSync(path.join(out,"trazabilidad.json"),JSON.stringify(trace,null,2));fs.writeFileSync(path.join(out,"payload.json"),JSON.stringify(payload,null,2));return ok({payload,ruta_trazabilidad:path.join(out,"trazabilidad.json"),validacion:v});
 }catch(e){return fail(e)}
}
export async function oc_crear(args:{caso:string,payload?:OrdenCompra,confirmado?:boolean}){
 const sId=args.payload?.referencia?.solicitud_id||args.caso;
 const control=path.join(OUT,"control.csv");ensureDir(OUT);const row=(resultado:string,numero:string|null,retro:boolean,bloq:string[],conf:string[])=>{const exists=fs.existsSync(control)?fs.readFileSync(control,"utf8"):"solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts\n";fs.writeFileSync(control,exists+toCsv([[sId,resultado,numero||"",retro,bloq.join("|"),conf.join("|"),new Date().toISOString()]]).split("\n").slice(0,-1).join("\n")+"\n")};
 try{
  const built=args.payload?{ok:true,data:{payload:args.payload,validacion:JSON.parse(await oc_validar({caso:args.caso})).data}}:JSON.parse(await oc_construir_payload({caso:args.caso}));
  if(!built.ok)throw new Error(built.error);const payload=built.data.payload;const validation=built.data.validacion;const sap=path.join(OUT,"sap");ensureDir(sap);const ordersFile=path.join(sap,"ordenes.jsonl");const existing=fs.existsSync(ordersFile)?fs.readFileSync(ordersFile,"utf8").split("\n").filter(Boolean).map(x=>JSON.parse(x)):[];
  const prev=existing.find((x:any)=>x.payload.referencia.solicitud_id===payload.referencia.solicitud_id);
  if(prev){row("idempotente",prev.numero_oc,validation.retroactiva,validation.bloqueos,validation.confirmaciones);return ok({numero_oc:prev.numero_oc,fecha:prev.fecha,idempotente:true})}
  if(validation.bloqueos.length){row("bloqueado",null,validation.retroactiva,validation.bloqueos,validation.confirmaciones);return fail(`OC bloqueada: ${validation.bloqueos.join("; ")}`)}
  if(validation.confirmaciones.length&&!args.confirmado){row("pendiente_confirmacion",null,validation.retroactiva,[],validation.confirmaciones);return fail(`Se requiere confirmación humana: ${validation.confirmaciones.join("; ")}`)}
  if(args.confirmado&&Array.isArray(payload.excepciones))payload.excepciones=payload.excepciones.map((e:any)=>({...e,confirmado_por:"usuario"}));
  const numero_oc=String(4500000001+existing.length),fecha=new Date().toISOString();const entry={numero_oc,fecha,payload,retroactiva:validation.retroactiva};fs.appendFileSync(ordersFile,JSON.stringify(entry)+"\n");row("creada",numero_oc,validation.retroactiva,[],validation.confirmaciones);return ok({numero_oc,fecha,idempotente:false,retroactiva:validation.retroactiva,ruta:ordersFile});
 }catch(e){try{row("error",null,false,[String(e)],[])}catch{}return fail(e)}
}
export const oc_tools={oc_leer_paquete,oc_validar,oc_construir_payload,oc_generar_evidencia,oc_crear};
