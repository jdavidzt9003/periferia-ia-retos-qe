import fs from "node:fs";
import path from "node:path";
import {OpenAIAdapter} from "./openai.js";
import {z} from "zod";
import {zodToJsonSchema} from "zod-to-json-schema";
import {tools as providerTools} from "../../reto-01/registry.js";
import {tools as contractTools} from "../../reto-02/registry.js";
import {tools as orderTools} from "../../reto-03/registry.js";
import {ROOT,logLine} from "../shared.js";

type ToolDef={description:string,args:Record<string,any>,execute:(args:any)=>Promise<string>};
const registries:Record<string,Record<string,ToolDef>>={
 "reto-01":providerTools as unknown as Record<string,ToolDef>,
 "reto-02":contractTools as unknown as Record<string,ToolDef>,
 "reto-03":orderTools as unknown as Record<string,ToolDef>
};
const promptFiles:Record<string,string>={"reto-01":"reto-01/agent/prompt.md","reto-02":"reto-02/agent/prompt.md","reto-03":"reto-03/agent/prompt.md"};
export async function runLlmAgent(challenge:string,history:{role:"user"|"assistant";content:string}[],message:string,maxTokens=12000){
 if(!process.env.OPENAI_API_KEY)throw new Error("OPENAI_API_KEY no configurada");
 const client=new OpenAIAdapter();
 const definitions=registries[challenge];const toolSpecs=Object.entries(definitions).map(([name,t])=>({type:"function" as const,function:{name,description:t.description,parameters:zodToJsonSchema(z.object(t.args as any)) as any}}));
 const prompt=fs.readFileSync(path.join(ROOT,promptFiles[challenge]),"utf8")+`
Reglas de ejecución:
- Usa herramientas para obtener hechos. No inventes datos ni afirmes valores no devueltos por herramientas.
- Nunca ejecutes acciones externas reales. Las herramientas solo escriben artefactos locales/simulados.
- Si una herramienta requiere confirmación humana, termina el turno con una pregunta explícita. No interpretes una pregunta previa como autorización si el mensaje actual no confirma claramente.
- Si hay bloqueos duros, no intentes saltártelos.
- Usa como máximo 25 iteraciones de llamadas a herramientas por turno.`;
 const messages:any[]=[{role:"system",content:prompt},...history.slice(-8).map(m=>({role:m.role,content:m.content})),{role:"user",content:message}];
 const calls:any[]=[];let reply="";let tokensUsed=0;
 for(let iteration=0;iteration<25;iteration++){
  const response=await client.completar(messages,toolSpecs);
  tokensUsed+=Number(response.usage?.total_tokens||0);if(tokensUsed>maxTokens){reply="Se alcanzó el límite de tokens configurado para esta sesión. Inicia una nueva sesión o ajusta MAX_SESSION_TOKENS.";break}const assistant=response.choices[0]?.message;if(!assistant)throw new Error("El modelo no devolvió respuesta");
  if(!assistant.tool_calls?.length){reply=assistant.content||"No se obtuvo una respuesta.";break}
  messages.push(assistant);
  for(const call of assistant.tool_calls){
   if(call.type!=="function")continue;
   const def=definitions[call.function.name];let result:string;
   try{
    if(!def)throw new Error(`Herramienta no permitida: ${call.function.name}`);
    const args=JSON.parse(call.function.arguments||"{}");
    const needsExplicitHuman=/^(oc_crear|proveedor_armar_paquete|contratos_registrar)$/.test(call.function.name)&&args.confirmado===true;
    const explicitHuman=/\b(confirmo|confirmar|confirmado|autorizo|proceder|sí,? confirmo|si,? confirmo)\b/i.test(message);
    if(needsExplicitHuman&&!explicitHuman)result=JSON.stringify({ok:false,error:"La confirmación debe estar explícita en el mensaje actual; no ejecuto la acción."});
    else {const schema=z.object(def.args as any);const parsed=schema.safeParse(args);
    if(!parsed.success)result=JSON.stringify({ok:false,error:parsed.error.issues.map(x=>x.message).join("; ")});
    else result=await def.execute(parsed.data);}
   }catch(e){result=JSON.stringify({ok:false,error:e instanceof Error?e.message:"Error de herramienta"})}
   const parsedResult=(()=>{try{return JSON.parse(result)}catch{return {ok:false,error:result}}})();
   calls.push({name:call.function.name,args:call.function.arguments,result:JSON.stringify(parsedResult.ok?parsedResult.data:parsedResult.error).slice(0,800)});
   logLine(path.join(ROOT,"out",challenge,"log.jsonl"),{herramienta:call.function.name,mensaje_id:null,ok:Boolean(parsedResult.ok),resumen:JSON.stringify(parsedResult.ok?parsedResult.data:parsedResult.error).slice(0,300)});
   messages.push({role:"tool",tool_call_id:call.id,content:result});
  }
  if(iteration===24)reply="Alcancé el límite de 25 iteraciones. Revisa las herramientas ejecutadas y dime cómo deseas continuar.";
 }
 const needsConfirmation=/¿.*confirm|confirmas|confirma.*(continuar|crear|registrar|enviar)|requiere confirmación/i.test(reply);
 return {reply,toolCalls:calls,needsConfirmation,tokensUsed};
}
