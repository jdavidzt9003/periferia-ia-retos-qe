# Reto 02 — Registro de contratos vigentes

## Ejecución
Desde la raíz del monorepo: `npm install`, luego `npm run dev` y abre `http://localhost:3000`.

## Demo sin modelo
`npm run demo:02` procesa los seis mensajes del buzón, clasifica los contratos y genera `out/reto-02/alertas.md`. Los archivos de salida se escriben en `out/reto-02/sharepoint/`; nunca se modifica el CSV fixture.

## Herramientas
`contratos_leer_buzon`, `contratos_extraer`, `contratos_validar`, `contratos_registrar`, `contratos_alertas`.

Los campos con confianza inferior a 0.8 requieren confirmación. Los mensajes sin contrato se rechazan sin interrumpir el lote.
