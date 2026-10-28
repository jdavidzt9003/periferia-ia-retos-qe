# SOLUCION.md — Reto 03: Agente de órdenes de compra SAP

## 1. Problema en una frase
Preparar órdenes de compra a partir de solicitud, cotización y aprobación, aplicando controles de negocio antes de escribir una OC en un SAP simulado y midiendo las órdenes retroactivas.

## 2. Arquitectura
```text
Chat web → API Express → oc_leer_paquete → oc_validar
                                       ├→ oc_construir_payload + trazabilidad
                                       ├→ oc_generar_evidencia TXT/PDF + SHA-256
                                       └→ oc_crear → adaptador SAP simulado → out/sap
```
El prompt está en `agent/prompt.md`; el conocimiento se deriva del PRD y se documenta aquí; la ejecución está en `tools.ts`, con contratos Zod en `registry.ts`. El fixture de maestros se lee en modo solo lectura.

## 3. Ciclo y confirmación
1. Leer paquete normalizado.
2. Validar proveedor activo, aprobación autorizada, tope, subárea, monto, cotización, IVA, condiciones de pago, fechas y factura retroactiva.
3. Construir payload y trazabilidad.
4. Generar evidencia TXT con hash SHA-256 y PDF.
5. Crear solo si no hay bloqueos y las confirmaciones están resueltas. La creación es idempotente por `solicitud_id`, asigna número desde `4500000001` y escribe `out/control.csv`.

## 4. Modelo y costo
Proveedor opcional: OpenAI `gpt-4o-mini` para seleccionar herramientas y redactar la respuesta; las validaciones y el payload son deterministas. No se publica costo estimado no medido. La demo no requiere API key.

## 5. Matriz RC1–RC10
| Regla | Implementación |
|---|---|
| RC1 proveedor activo por NIT/nombre | Busca en `proveedores.json`; inexistente/inactivo bloquea. |
| RC2 aprobación | Requiere correo con “Aprobado” y remitente autorizado para el centro. |
| RC3 tope aprobador | Bloquea si el total excede el tope del aprobador. |
| RC4 subárea | Debe pertenecer al centro de costo. |
| RC5 cotización | Diferencia mayor a 2 % o ausencia requiere confirmación. |
| RC6 IVA ausente | Deriva indicador por defecto del proveedor y pide confirmación. |
| RC7 condición de pago ausente | Deriva del maestro e informa. |
| RC8 factura anterior | Marca `retroactiva=true`, pide confirmación y escribe el control. |
| RC9 aprobación anterior a solicitud | Pide confirmación. |
| RC10 cantidad × precio | Bloquea si difiere del total más de una unidad monetaria. |

La regla más sensible es impedir que el agente modifique importes para hacer coincidir solicitud y cotización. Los importes provienen de los adjuntos normalizados y la discrepancia se presenta como confirmación, nunca se corrige automáticamente.

## 6. Diseño de adaptador SAP real
### Elección
Si el landscape permite integración y el equipo SAP publica el servicio, priorizaría SAP S/4HANA OData `API_PURCHASEORDER_PROCESS_SRV` detrás de SAP Integration Suite. La viabilidad no está confirmada, por lo que la primera entrega conservaría el adaptador local y un contrato de interfaz estable. RFC/BAPI `BAPI_PO_CREATE1` es alternativa cuando el landscape y el equipo de Basis habilitan conectividad RFC administrada.

### Mapeo
- `sociedad` y `organizacion_compras` → campos de cabecera de la OC.
- `proveedor.codigo_sap` → proveedor SAP; validar que el maestro esté activo antes del POST.
- `moneda`, `condiciones_pago` → cabecera.
- `posiciones[].descripcion`, `cantidad`, `precio_unitario`, `centro_costo`, `indicador_iva` → posiciones, imputación y determinación fiscal.
- `aprobador` y hash de evidencia → referencia/año de auditoría o adjunto documental según API y configuración real.
- `solicitud_id` → referencia externa idempotente.

El mapeo final debe validarse contra la versión real del servicio, sociedad y customizing; el payload de este reto es simplificado, no un contrato SAP productivo.

### Seguridad
Autenticación mediante OAuth2/client credentials o mecanismo aprobado por SAP, almacenado en vault/secret manager del entorno. No poner secretos en prompt, repositorio, logs ni frontend. Usar cuenta técnica de privilegio mínimo, TLS, rotación y auditoría. El agente nunca recibe contraseña SAP en conversación.

### Idempotencia y errores parciales
Antes de crear, buscar `solicitud_id` en un registro de idempotencia y consultar la referencia externa en SAP. Si el POST expira, no reintentar a ciegas: reconciliar primero. Registrar request-id, respuesta técnica saneada y estado `pendiente_reconciliacion` ante incertidumbre. Errores de validación son no reintentables hasta corregir datos; errores transitorios pueden reintentarse con backoff idempotente. Un error parcial deja la solicitud bloqueada y genera ticket, no una segunda OC.

### Plan B
Generar payload revisado en JSON/CSV compatible con plantilla de carga masiva, evidencia de aprobación y trazabilidad. El analista importa o copia el payload en SAP y confirma el número generado. El proceso sigue ahorrando digitación y deja evidencia sin fingir integración real.

## 7. Lectura de órdenes retroactivas
Una OC creada después de recibir la factura indica un desvío de control y expone a la compañía a reprocesos, diferencias entre la fecha del compromiso y la contabilización, menor capacidad de negociar cotizaciones y trazabilidad incompleta. No todas las retroactivas tienen la misma causa: puede haber urgencia operativa, desconocimiento del proceso, demoras de aprobación o una compra fuera del canal. La dirección debería medir porcentaje de OC retroactivas por mes, área, proveedor y motivo; revisar una muestra con Compras y Finanzas; y separar excepciones justificadas de incumplimientos repetitivos. Como cambio de proceso, exigir que la solicitud y cotización entren por el canal único antes de comprometer gasto, fijar SLA de aprobación y permitir una excepción explícita con responsable, motivo y auditoría. El agente mide y presenta el caso, pero no define por sí solo la política de tolerancia.

## 8. Decisiones y trade-offs
1. Simular SAP en archivos: auditable y reproducible, pero no prueba conectividad real.
2. Confirmaciones separadas de bloqueos: el humano puede resolver incertidumbres, pero no saltarse controles duros.
3. Hash de evidencia: aporta integridad del contenido, pero no sustituye firma digital.
4. Persistencia JSONL/CSV: simple y suficiente para reto, no segura para concurrencia productiva.

## 9. Supuestos
- Maestros ficticios son la fuente autorizada para la evaluación.
- Los adjuntos binarios están normalizados como JSON/TXT.
- La fecha de ejecución del control es la fecha del servidor.
- La aprobación por correo se considera evidencia suficiente para este reto; auditoría puede exigir firma digital.
- No se conecta a SAP real.

## 10. Cobertura
| Historia | Estado | Pendiente para producción |
|---|---|---|
| HU-1 leer paquete | Hecho para fixtures | Parser de adjuntos reales y esquema más estricto |
| HU-2 controles | Implementación base de RC1–RC10 | Pruebas unitarias exhaustivas y matriz de moneda/unidad |
| HU-3 payload/trazabilidad | Hecho | Validar esquema final con SAP |
| HU-4 evidencia | TXT+SHA-256 y PDF | Adjuntar a repositorio documental |
| HU-5 crear OC | SAP simulado, secuencia e idempotencia | Adaptador real, transacciones y reconciliación |
| HU-6 errores | `{ok:false,error}` por herramienta | Métricas y observabilidad productiva |

## 11. Uso de IA
Se usó ChatGPT para analizar el PRD, generar/revisar código inicial y redactar la documentación. No se incluyeron claves ni conexiones reales. La persona que entrega debe revisar y poder explicar el código.

## 12. Riesgos y mitigación
- **OC incorrecta:** bloqueo de controles, revisión humana, payload trazable.
- **Reintentos duplicados:** clave idempotente y reconciliación con SAP.
- **Aprobación falsificada o insuficiente:** validar remitente y considerar firma digital.
- **Retroactividad normalizada:** dashboard de control, responsable y plan de reducción.
- **Secretos expuestos:** vault, privilegio mínimo y saneamiento de logs.
