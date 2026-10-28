import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {logLine} from "./shared.js";
import {proveedor_leer_solicitud,proveedor_generar_formulario,proveedor_armar_paquete} from "../reto-01/tools.js";
import {contratos_leer_buzon,contratos_extraer,contratos_validar,contratos_registrar,contratos_alertas} from "../reto-02/tools.js";
import {oc_leer_paquete,oc_validar,oc_construir_payload,oc_generar_evidencia,oc_crear} from "../reto-03/tools.js";
import {runLlmAgent} from "./llm/agent.js";
const app=express();app.use(cors());app.use(express.json({limit:"1mb"}));
const __dirname=path.dirname(fileURLToPath(import.meta.url));const publicDir=path.join(process.cwd(),"public");app.use(express.static(publicDir));
type Msg={role:"user"|"assistant";content:string;toolCalls?:any[];needsConfirmation?:boolean};
const sessions=new Map<string,Msg[]>();
const sessionTokens=new Map<string,number>();
type PendingAction={challenge:string;caseId:string};
// La confirmación se vincula al reto y al caso que originaron la pregunta.
// No se infiere un caso por defecto al confirmar una acción pendiente.
const pendingActions=new Map<string,PendingAction>();
function parsed(s:string){try{return JSON.parse(s)}catch{return {ok:false,error:s}}}
function casePattern(challenge:string){return challenge==="reto-01"?/(co-industrias-delta|ec-corp-andina|hn-agroexport-sula|pa-logistica-istmo)/i:challenge==="reto-02"?/(msg-00[1-6])/i:/(sol-00[1-6])/i}
function caseIn(message:string,challenge:string){return message.match(casePattern(challenge))?.[1]?.toLowerCase()||null}
function caseFrom(message:string,challenge:string){return caseIn(message,challenge)||(challenge==="reto-01"?"co-industrias-delta":challenge==="reto-02"?"msg-001":"sol-001")}
function isConfirmationMessage(message:string){return /\b(confirmo|confirmar|confirmado|autorizo|proceder)\b/i.test(message)||/^(sí|si)$/i.test(message.trim())}
async function runTools(challenge:string,message:string){
 const calls:any[]=[];let needsConfirmation=false;const add=async(name:string,args:any,fn:()=>Promise<string>)=>{const raw=await fn();const result=parsed(raw);calls.push({name,args,result:result.ok?JSON.stringify(result.data).slice(0,500):result.error});return result};
 const confirmed=/\b(confirmo|confirmar|confirmado|sí,? confirmo|proceder)\b/i.test(message);
 if(challenge==="reto-01"){
  const caso=caseFrom(message,challenge);const a=await add("proveedor_leer_solicitud",{caso},()=>proveedor_leer_solicitud({caso}));
  const f=await add("proveedor_generar_formulario",{caso},()=>proveedor_generar_formulario({caso}));
  const p=await add("proveedor_armar_paquete",{caso,confirmado:confirmed},()=>proveedor_armar_paquete({caso,confirmado:confirmed}));
  needsConfirmation=!confirmed;
  return {calls,needsConfirmation,reply:`**Reto 01 · Registro como proveedor — ${caso}**\n\n${a.ok?`Se identificaron ${a.data.campos.length} campos para formato ${a.data.formato}.`:`Error al leer: ${a.error}`}\n\n${f.ok?`Formulario generado: ${f.data.ruta}`:`Formulario: ${f.error}`}\n\n${p.ok?`Estado del paquete: **${p.data.listo_para_firma?"listo para firma":"bloqueado por soportes ausentes/vencidos"}**. Checklist y borrador en ${p.data.paquete}.`:`Error de paquete: ${p.error}`}\n\n${confirmed?"Confirmación recibida: se generó únicamente el registro ENVIO-SIMULADO cuando corresponde; no se hizo envío externo.":"Antes de simular el envío, ¿confirmas que deseas registrar la intención de envío? No se enviará ningún correo real."}`};
 }
 if(challenge==="reto-02"){
  const alertDate=message.match(/(20\d{2}-\d{2}-\d{2})/);
  if(/alerta/i.test(message)){const hoy=alertDate?.[1]||new Date().toISOString().slice(0,10);const a=await add("contratos_alertas",{hoy},()=>contratos_alertas({hoy}));return {calls,needsConfirmation:false,reply:a.ok?`**Reporte de alertas generado**\n\nFecha de referencia: ${hoy}\nContratos que vencen en 60 días: ${a.data.vencen.length}\nPólizas pendientes/no vigentes: ${a.data.polizas_pendientes.length}\nContratos desde fecha de corte: ${a.data.registrados_desde_corte.length}\n\nArchivo: ${a.data.ruta}`:`No pude generar alertas: ${a.error}`};}
  const caso=caseFrom(message,challenge);const inbox=await add("contratos_leer_buzon",{},()=>contratos_leer_buzon({}));
  if(/buz[oó]n|todos|lote|procesar todo/i.test(message)){
   const lines=[];for(const m of inbox.data?.mensajes||[]){const e=await add("contratos_extraer",{mensaje_id:m.id},()=>contratos_extraer({mensaje_id:m.id}));if(!e.ok){lines.push(`${m.id}: error ${e.error}`);continue}const v=await add("contratos_validar",{mensaje_id:m.id},()=>contratos_validar({mensaje_id:m.id,contrato:e.data}));lines.push(`${m.id}: ${v.data?.clasificacion}${v.data?.requiere_revision?.length?` (revisión: ${v.data.requiere_revision.join(", ")})`:""}`)}return {calls,needsConfirmation:false,reply:`**Reto 02 · Buzón de contratos**\n\n${lines.join("\n")}\n\nLos registros con campos de baja confianza permanecen pendientes de confirmación humana.`};
  }
  const e=await add("contratos_extraer",{mensaje_id:caso},()=>contratos_extraer({mensaje_id:caso}));if(!e.ok)return {calls,needsConfirmation:false,reply:`No pude extraer ${caso}: ${e.error}`};
  const v=await add("contratos_validar",{mensaje_id:caso},()=>contratos_validar({mensaje_id:caso,contrato:e.data}));
  let r:any=null;if(v.data?.clasificacion==="nuevo"||v.data?.clasificacion==="actualizacion"){r=await add("contratos_registrar",{mensaje_id:caso,confirmado:confirmed},()=>contratos_registrar({mensaje_id:caso,contrato:e.data,confirmado:confirmed}));}
  const review=v.data?.requiere_revision||[];needsConfirmation=review.length>0&&!confirmed;
  return {calls,needsConfirmation,reply:`**Reto 02 · Registro de contratos — ${caso}**\n\nClasificación: **${v.data?.clasificacion||"error"}**.\n${v.data?.motivo?`Motivo: ${v.data.motivo}\n`:""}\n${review.length?`Requiere revisión: ${review.join(", ")}.\n`:""}${r?`Resultado de registro: ${r.ok?JSON.stringify(r.data):r.error}`:"No se realizó escritura para esta clasificación."}\n\n${needsConfirmation?"¿Confirmas que los campos pendientes pueden registrarse con los valores extraídos?":""}`};
 }
 const caso=caseFrom(message,challenge);const p=await add("oc_leer_paquete",{caso},()=>oc_leer_paquete({caso}));if(!p.ok)return {calls,needsConfirmation:false,reply:`No pude leer el paquete: ${p.error}`};
 const v=await add("oc_validar",{caso},()=>oc_validar({caso,paquete:p.data}));if(!v.ok)return {calls,needsConfirmation:false,reply:v.error};
 const payload=await add("oc_construir_payload",{caso},()=>oc_construir_payload({caso,paquete:p.data,derivados:v.data.derivados}));
 let created:any=null;
 if(/crear|crea la oc|proceder|confirmo/i.test(message)){created=await add("oc_crear",{caso,confirmado:confirmed},()=>oc_crear({caso,payload:payload.data?.payload,confirmado:confirmed}))}
 needsConfirmation=v.data.confirmaciones.length>0&&!confirmed;
 const fmt=(x:number)=>new Intl.NumberFormat("es-CO").format(x);
 return {calls,needsConfirmation,reply:`**Reto 03 · Orden de compra SAP — ${caso}**\n\nSolicitud: ${p.data.solicitud.solicitud_id} · Proveedor: ${p.data.solicitud.proveedor_nombre} · Total: ${fmt(p.data.solicitud.valor_total)} ${p.data.solicitud.moneda}.\n\n**Bloqueos:** ${v.data.bloqueos.length?v.data.bloqueos.join("; "):"ninguno"}.\n\n**Confirmaciones requeridas:** ${v.data.confirmaciones.length?v.data.confirmaciones.join("; "):"ninguna"}.\n\n**Payload:** ${payload.ok?payload.data.ruta_trazabilidad:payload.error}.\n\n${created?`Resultado creación: ${created.ok?JSON.stringify(created.data):created.error}`:"No se creó la OC en este turno."}\n\n${needsConfirmation?"¿Confirmas explícitamente que debo continuar con la creación de la OC?":""}`};
}
app.get("/api/health",(_req,res)=>res.json({ok:true,provider:process.env.OPENAI_API_KEY?"openai":"deterministic-tools",model:process.env.OPENAI_API_KEY?(process.env.OPENAI_MODEL||"gpt-4o-mini"):"none"}));
app.get("/api/sessions/:id",(req,res)=>res.json({sessionId:req.params.id,messages:sessions.get(req.params.id)||[]}));
app.post("/api/chat",async(req,res)=>{
 const sessionId=String(req.body?.sessionId||"default");const message=String(req.body?.message||"").trim();const challenge=String(req.body?.challenge||"reto-01");
 if(!message)return res.status(400).json({error:"El mensaje no puede estar vacío"});if(!["reto-01","reto-02","reto-03"].includes(challenge))return res.status(400).json({error:"Reto no válido"});
 const history=sessions.get(sessionId)||[];history.push({role:"user",content:message});
 try{
  let result:any;
  const pending=pendingActions.get(sessionId);
  // Una confirmación breve se resuelve contra la acción pendiente de ESTA sesión.
  // Nunca vuelve a ejecutar el flujo genérico, porque ese flujo tiene casos por defecto.
  if(isConfirmationMessage(message)){
   if(!pending){
    result={reply:"No hay una acción pendiente para confirmar. Primero procesa un caso e indica qué acción deseas autorizar.",toolCalls:[],needsConfirmation:false};
    history.push({role:"assistant",content:result.reply,toolCalls:[],needsConfirmation:false});sessions.set(sessionId,history);
    return res.json({sessionId,reply:result.reply,toolCalls:[],needsConfirmation:false});
   }
   if(pending.challenge!==challenge){
    result={reply:`La confirmación pendiente pertenece a ${pending.challenge} (${pending.caseId}). Selecciona ese reto para continuar o cancela la acción pendiente. No ejecuté ninguna herramienta.`,toolCalls:[],needsConfirmation:true};
    history.push({role:"assistant",content:result.reply,toolCalls:[],needsConfirmation:true});sessions.set(sessionId,history);
    return res.json({sessionId,reply:result.reply,toolCalls:[],needsConfirmation:true});
   }
   const requestedCase=caseIn(message,pending.challenge);
   if(requestedCase&&requestedCase!==pending.caseId){
    result={reply:`La confirmación pendiente es para ${pending.caseId}, pero el mensaje menciona ${requestedCase}. No ejecuté ninguna acción. Confirma ${pending.caseId} explícitamente o cancela la operación.`,toolCalls:[],needsConfirmation:true};
    history.push({role:"assistant",content:result.reply,toolCalls:[],needsConfirmation:true});sessions.set(sessionId,history);
    return res.json({sessionId,reply:result.reply,toolCalls:[],needsConfirmation:true});
   }
   const actionText=pending.challenge==="reto-01"?`confirmo registro de proveedor ${pending.caseId}`:pending.challenge==="reto-02"?`confirmo registro de contrato ${pending.caseId}`:`confirmo creación de la OC ${pending.caseId}`;
   const confirmedResult=await runTools(pending.challenge,actionText);
   pendingActions.delete(sessionId);
   result={reply:confirmedResult.reply,toolCalls:confirmedResult.calls,needsConfirmation:confirmedResult.needsConfirmation};
   history.push({role:"assistant",content:result.reply,toolCalls:result.toolCalls,needsConfirmation:result.needsConfirmation});sessions.set(sessionId,history);
   return res.json({sessionId,reply:result.reply,toolCalls:result.toolCalls,needsConfirmation:result.needsConfirmation});
  }
  if(/\b(cancelar|cancela|anula la confirmación)\b/i.test(message)&&pending){
   pendingActions.delete(sessionId);result={reply:`Acción pendiente cancelada (${pending.challenge}: ${pending.caseId}). No se ejecutó ninguna creación ni registro.`,toolCalls:[],needsConfirmation:false};
   history.push({role:"assistant",content:result.reply,toolCalls:[],needsConfirmation:false});sessions.set(sessionId,history);
   return res.json({sessionId,reply:result.reply,toolCalls:[],needsConfirmation:false});
  }
  const sessionBudget=Number(process.env.MAX_SESSION_TOKENS||12000);
  if(process.env.OPENAI_API_KEY && (sessionTokens.get(sessionId)||0)<sessionBudget){
   try{result=await runLlmAgent(challenge,history.slice(0,-1),message,sessionBudget-(sessionTokens.get(sessionId)||0));sessionTokens.set(sessionId,(sessionTokens.get(sessionId)||0)+Number(result.tokensUsed||0))}
   catch(e){const fallback=await runTools(challenge,message);result={reply:`No pude usar el modelo en este turno; ejecuté el flujo determinista. ${fallback.reply}`,toolCalls:fallback.calls,needsConfirmation:fallback.needsConfirmation}}
  }else{
   const fallback=await runTools(challenge,message);result={reply:process.env.OPENAI_API_KEY?"Límite de tokens de sesión alcanzado. "+fallback.reply:fallback.reply,toolCalls:fallback.calls,needsConfirmation:fallback.needsConfirmation}
  }
  // Si el agente formula una pregunta explícita de autorización, la tratamos como pendiente
  // aunque el proveedor LLM no haya marcado correctamente needsConfirmation.
  if(!result.needsConfirmation&&/(?:¿[^\n]*(?:confirm|autoriz)|requiere confirmación humana|confirmas explícitamente)/i.test(String(result.reply||"")))result.needsConfirmation=true;
  if(result.needsConfirmation){
   const pendingCase=caseIn(message,challenge)||caseIn(result.reply,challenge);
   if(pendingCase)pendingActions.set(sessionId,{challenge,caseId:pendingCase});
  }else if(caseIn(message,challenge)){
   // Una nueva solicitud completa reemplaza cualquier confirmación anterior de la sesión.
   pendingActions.delete(sessionId);
  }
  history.push({role:"assistant",content:result.reply,toolCalls:result.toolCalls,needsConfirmation:result.needsConfirmation});sessions.set(sessionId,history);
  res.json({sessionId,reply:result.reply,toolCalls:result.toolCalls,needsConfirmation:result.needsConfirmation});
 }catch(e){res.status(500).json({error:e instanceof Error?e.message:"Error inesperado"})}
});
const port=Number(process.env.PORT||3000);app.listen(port,()=>console.log(`Periferia IA retos disponible en http://localhost:${port}`));
