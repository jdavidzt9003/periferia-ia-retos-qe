# Reto 03 — Órdenes de compra SAP

## Ejecución
Desde la raíz del monorepo: `npm install`, luego `npm run dev` y abre `http://localhost:3000`.

## Demo sin modelo
`npm run demo:03` ejecuta los seis casos. Demuestra idempotencia de `sol-001`, la confirmación de `sol-004` y la marca retroactiva de `sol-005`. Salidas: `out/reto-03/`.

## Herramientas
`oc_leer_paquete`, `oc_validar`, `oc_construir_payload`, `oc_generar_evidencia`, `oc_crear`.

El adaptador SAP es simulado y escribe archivos. No hay conexión real con SAP.
