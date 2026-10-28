# Reto 01 — Registro como proveedor

## Ejecución
Desde la raíz del monorepo: `npm install`, copia `.env.example` a `.env` si deseas configurar el modelo, y ejecuta `npm run dev`. Abre `http://localhost:3000`.

## Demo sin modelo
`npm run demo:01` procesa `co-industrias-delta`, `ec-corp-andina`, `hn-agroexport-sula` y `pa-logistica-istmo`. Las salidas se escriben en `out/reto-01/`.

## Herramientas
- `proveedor_leer_solicitud`: solicitud, plantilla, glosario, maestro y soportes exigidos.
- `proveedor_generar_formulario`: genera XLSX, PDF o valores de portal.
- `proveedor_armar_paquete`: checklist, copias de soportes y borrador de correo.

No se realiza ningún envío externo. El formato portal solo genera valores listos para copiar. Los fixtures originales se consideran de solo lectura.
