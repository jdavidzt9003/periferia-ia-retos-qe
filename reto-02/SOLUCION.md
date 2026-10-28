# SOLUCION.md — Reto 02: Agente de registro de contratos vigentes

## 1. Problema en una frase
Centralizar el registro de contratos recibidos por un buzón único, reduciendo digitación y detectando duplicados, otrosíes, documentos incompletos y riesgos de vencimiento.

## 2. Arquitectura
```text
Chat web → API Express → herramientas contratos_*
                         ├─ buzón/adjuntos + comerciales.json
                         ├─ maestro-contratos.csv (fixture solo lectura)
                         └─ out/reto-02/sharepoint + historial + alertas
```
El prompt está en `agent/prompt.md`, el conocimiento del proceso se documenta en este archivo y el comportamiento ejecutable reside en `tools.ts`. El registro Zod se encuentra en `registry.ts`.

## 3. Ciclo del agente
1. Lista mensajes no procesados.
2. Extrae campos deterministas del texto del contrato y asigna confianza por campo.
3. Valida contra el maestro y clasifica como nuevo, actualización, duplicado o rechazado.
4. Si hay campos con confianza inferior a 0.8, solicita confirmación antes de registrar.
5. Copia el contrato a `out/reto-02/sharepoint/Contratos/<año>/<cliente>/<id>`, actualiza una copia del CSV y registra historial.
6. Genera alertas con una fecha de referencia explícita. Un mensaje malo no detiene la revisión de los demás.

## 4. Modelo y costo
OpenAI `gpt-4o-mini` es opcional para el ciclo de tool-calling; la extracción y clasificación de la demo son deterministas. No se afirma un costo fijo sin medir tokens. `npm run demo:02` no necesita clave.

## 5. Matriz de reglas
| Regla | Implementación |
|---|---|
| RN1 duplicado | Mismo ID y mismos campos clave: se reporta y no se escribe. |
| RN2 actualización | Mismo ID con cambios / otrosí: actualiza fila y agrega historial. |
| RN3 nuevo | Sin coincidencia en maestro, inserta nueva fila. |
| RN4 rechazado | Sin contrato adjunto o sin partes/objeto identificables. |
| RN5 revisión | Campos de confianza < 0.8 se listan; `confirmado=true` requerido para registrar. |
| RN6 fixture inmutable | Se copia el CSV a `out/reto-02/sharepoint/` antes de modificarlo. |
| RN7 auditoría | Cada herramienta escribe un evento JSONL en `out/reto-02/log.jsonl`. |

La dificultad principal es el otrosí: representa una actualización parcial, no un contrato nuevo. Se conserva el ID existente y se preservan campos que el otrosí no modifica. La extracción de texto es heurística y debe revisarse ante documentos legales distintos a los fixtures.

## 6. Propuesta de regla de gobierno
### Canal único
Crear un buzón corporativo administrado por Legal/Administración, por ejemplo `contratos@empresa.example` (dirección ilustrativa, no creada). Dos responsables: titular de proceso y suplente. El agente no administra permisos ni cambia reglas del buzón.

### Obligación del comercial
Enviar dentro de dos días hábiles de la firma el PDF firmado por todas las partes, los otrosíes, anexos de póliza y actas de terminación. Asunto recomendado: `[CONTRATO|OTROSI|TERMINACION] - ID - Cliente - Fecha firma`. Los documentos deben ser legibles, completos y en PDF; el valor indeterminado debe declararse explícitamente.

### Acuse automático
En minutos, confirmar recepción, listar adjuntos detectados, ID del contrato si se reconoce y estado: registrado, pendiente de revisión o rechazado. El acuse no equivale a aprobación jurídica.

### Excepciones y escalamiento
Contrato sin firma o sin partes identificables: rechazar el registro y escalar al comercial y Legal. Valor/fecha ambiguos: dejar en cola de revisión con evidencia textual y confianza. Un remitente no reconocido se informa, pero no bloquea por sí solo.

### Cierre del gap junio–agosto de 2026
Ejecutar campaña de conciliación contra facturas emitidas en junio, julio y agosto; solicitar a cada comercial contratos y otrosíes faltantes; comparar contra el maestro; deduplicar por ID y NIT+objeto; hacer revisión jurídica de conflictos; cerrar cada registro con trazabilidad y responsable. No sobrescribir datos conflictivos automáticamente.

### Indicador mensual
`% de contratos asociados a facturas del mes que existen en el maestro y tienen documento firmado archivado`, meta inicial ≥ 98%; complementar con mediana de horas entre firma y registro.

## 7. Decisiones y trade-offs
1. Regex/heurísticas deterministas para P0: trazables y sin costo, pero menos robustas que OCR/LLM sobre PDFs complejos.
2. CSV y JSONL en `out/`: inspeccionables y sencillos, pero sin transacciones concurrentes.
3. Confirmación para baja confianza: reduce errores, pero requiere cola de trabajo humana.

## 8. Supuestos
- Los contratos de fixture contienen texto plano; no se realiza OCR.
- Los maestros son completos para la evaluación.
- `hoy` es argumento de herramienta para resultados reproducibles.
- Un valor por demanda se almacena como cero con `valor_indeterminado` inferido/documentado cuando aplica; la extracción exacta debe confirmarse.

## 9. Cobertura
| Historia | Estado | Pendiente para producción |
|---|---|---|
| HU-1 buzón | Hecho para estructura de fixtures | Conector real de correo y lock de concurrencia |
| HU-2 extracción | Hecho con heurísticas y confianza | Extracción de PDF/OCR y más pruebas legales |
| HU-3 validación/clasificación | Hecho para reglas base | Similitud robusta de objeto y reconciliación avanzada |
| HU-4 registrar/archivar | Hecho sobre copias locales | SharePoint real, control de versiones y permisos |
| HU-5 alertas | Hecho, fecha configurable | Notificaciones corporativas y calendario laboral |
| HU-6 errores | Manejo básico por herramienta | Pruebas de lotes corruptos y observabilidad |

## 10. Uso de IA
Se usó ChatGPT para interpretar el PRD, crear y revisar una primera implementación y documentar decisiones. Los campos de negocio no se rellenan con generación libre; se contrastan con texto y maestro.

## 11. Riesgos
- **Error de extracción legal:** confianza, revisión humana y conservación del texto fuente.
- **Actualización incorrecta:** guardar diferencias e historial, nunca editar el fixture.
- **Documentos sensibles:** permisos mínimos, cifrado en reposo y retención definida.
- **Backlog de contratos no registrados:** campaña de conciliación e indicador mensual.
