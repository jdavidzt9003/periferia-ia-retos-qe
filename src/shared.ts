import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export const ROOT = process.cwd();
export function readJson<T=any>(file:string):T { return JSON.parse(fs.readFileSync(file,"utf8")) as T; }
export function ensureDir(dir:string){ fs.mkdirSync(dir,{recursive:true}); }
export function safeSlug(s:string){ return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
export function logLine(file:string, row:Record<string,any>){ ensureDir(path.dirname(file)); fs.appendFileSync(file,JSON.stringify({ts:new Date().toISOString(),...row})+"\n"); }
export function ok(data:any){return JSON.stringify({ok:true,data});}
export function fail(error:unknown){return JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)});}
export function sha256(s:string){return crypto.createHash("sha256").update(s).digest("hex");}
export function getPath(obj:any,dotted:string):any{return dotted.split(".").reduce((v,k)=>v?.[k],obj);}
export function normalize(s:string){return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");}
export function parseCsv(text:string):string[][] {
 const rows:string[][]=[]; let row:string[]=[], field="", quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i]; if(c==='"'&&text[i+1]==='"'&&quoted){field+='"';i++} else if(c==='"'){quoted=!quoted} else if(c===','&&!quoted){row.push(field);field=""} else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x!==""))rows.push(row);row=[];field=""}else field+=c;}
 row.push(field);if(row.some(x=>x!==""))rows.push(row);return rows;
}
export function csvEscape(v:any){const s=Array.isArray(v)?v.join(";"):String(v??"");return /[,"\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
export function toCsv(rows:any[][]){return rows.map(r=>r.map(csvEscape).join(",")).join("\n")+"\n";}
