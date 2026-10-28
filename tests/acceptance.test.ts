import test from "node:test";
import assert from "node:assert/strict";
import {proveedor_leer_solicitud} from "../reto-01/tools.js";
import {contratos_extraer,contratos_validar} from "../reto-02/tools.js";
import {oc_leer_paquete,oc_validar} from "../reto-03/tools.js";

test("Reto 01 carga solicitud y mapea campos sin inventar",async()=>{
 const r=JSON.parse(await proveedor_leer_solicitud({caso:"co-industrias-delta"}));
 assert.equal(r.ok,true);assert.equal(r.data.pais,"CO");assert.ok(r.data.campos.length>0);
 assert.ok(r.data.campos.every((x:any)=>["lleno","faltante","requiere_confirmacion"].includes(x.status)));
});
test("Reto 02 identifica un contrato nuevo y rechaza una cotización sin contrato",async()=>{
 const e=JSON.parse(await contratos_extraer({mensaje_id:"msg-001"}));assert.equal(e.ok,true);const v=JSON.parse(await contratos_validar({mensaje_id:"msg-001",contrato:e.data}));assert.equal(v.data.clasificacion,"nuevo");
 const q=JSON.parse(await contratos_extraer({mensaje_id:"msg-005"}));const qv=JSON.parse(await contratos_validar({mensaje_id:"msg-005",contrato:q.data}));assert.equal(qv.data.clasificacion,"rechazado");
});
test("Reto 03 bloquea proveedor inexistente y detecta diferencia en sol-004",async()=>{
 const p2=JSON.parse(await oc_leer_paquete({caso:"sol-002"}));const v2=JSON.parse(await oc_validar({caso:"sol-002",paquete:p2.data}));assert.ok(v2.data.bloqueos.some((x:string)=>x.includes("Proveedor inexistente")));
 const p4=JSON.parse(await oc_leer_paquete({caso:"sol-004"}));const v4=JSON.parse(await oc_validar({caso:"sol-004",paquete:p4.data}));assert.ok(v4.data.confirmaciones.some((x:string)=>x.includes("Cotización")));
});
