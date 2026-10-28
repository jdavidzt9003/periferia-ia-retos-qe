import fs from "node:fs"; 
import path from "node:path"; 
import { ROOT } from "../src/shared.js"; 
import { oc_leer_paquete, oc_validar, oc_construir_payload, oc_crear } from "./tools.js";


process.env.DEMO_MODE = "1";
fs.rmSync(path.join(ROOT, "out/reto-03"), { recursive: true, force: true });
for (const caso of ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"]) {
    const p = JSON.parse(await oc_leer_paquete({ caso })); const v = JSON.parse(await oc_validar({ caso, paquete: p.data }));
    let payload: any = null; if (p.ok && v.ok) payload = JSON.parse(await oc_construir_payload({ caso, paquete: p.data, derivados: v.data.derivados }));
    let create: any = null; if (caso === "sol-001" || caso === "sol-004" || caso === "sol-005") { create = JSON.parse(await oc_crear({ caso, payload: payload?.data?.payload, confirmado: caso !== "sol-001" ? true : false })); }
    console.log(JSON.stringify({ caso, apta: v.data?.apta, bloqueos: v.data?.bloqueos, confirmaciones: v.data?.confirmaciones, retroactiva: v.data?.retroactiva, creacion: create?.data || create?.error }, null, 2));
    if (caso === "sol-001") { const again = JSON.parse(await oc_crear({ caso, payload: payload?.data?.payload, confirmado: true })); console.log("IDEMPOTENCIA sol-001:", JSON.stringify(again.data)); }
}
