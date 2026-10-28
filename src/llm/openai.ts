import OpenAI from "openai";
import type {LlmAdapter} from "./adapter.js";
export class OpenAIAdapter implements LlmAdapter{
 private client:OpenAI;
 constructor(){if(!process.env.OPENAI_API_KEY)throw new Error("OPENAI_API_KEY no configurada");this.client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:20000,maxRetries:1});}
 async completar(mensajes:unknown[],herramientas:unknown[]){
  return this.client.chat.completions.create({model:process.env.OPENAI_MODEL||"gpt-4o-mini",messages:mensajes as any,tools:herramientas as any,tool_choice:"auto",temperature:0.1,max_tokens:900});
 }
}
