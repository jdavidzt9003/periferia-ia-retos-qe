# SOLUCION.md — Reto 01: Agente de registro como proveedor

## 1. Problema en una frase
Reducir el trabajo manual de diligenciar formularios de proveedores, relacionando cada campo con una fuente maestra verificable y preparando un paquete de soportes sin ejecutar envíos externos.

## 2. Arquitectura
```text
Chat web → API Express → orquestación por intención
                         ├─ proveedor_leer_solicitud
                         ├─ proveedor_generar_formulario
                         └─ proveedor_armar_paquete
                                  ↓
fixtures/reto-01 (solo lectura) → out/reto-01 (artefactos)
```
El prompt vive en `agent/prompt.md`; las reglas deterministas viven en `tools.ts`; el contrato Zod está en `registry.ts`. El maestro y el glosario son la única fuente de valores. Con clave configurada, el ciclo del agente usa OpenAI function calling y ejecuta herramientas tipadas; sin clave se activa la orquestación determinista para demo.

## 3. Ciclo del agente
1. Identifica el caso desde el mensaje.
2. Lee solicitud, plantilla, glosario, maestro y soportes exigidos.
3. Clasifica cada campo como `lleno`, `faltante` o `requiere_confirmacion`, registrando la ruta de fuente.
4. Genera XLSX, PDF o un Markdown de valores para portal.
5. Copia soportes disponibles, marca ausentes/vencidos, produce checklist y borrador de correo.
6. Formula confirmación explícita. La acción solo escribe un archivo `ENVIO-SIMULADO.md`; no envía correo ni firma.

## 4. Elección del modelo y costo
Proveedor opcional: OpenAI `gpt-4o-mini`, configurable por `OPENAI_MODEL`. No se fija un costo por caso sin medir tokens y consultar el precio vigente. El flujo determinista y `demo.ts` funcionan sin modelo ni clave.

## 5. Matriz de reglas
| Regla | Implementación |
|---|---|
| RN1 — identificador tributario por país | Glosario mapea NIT/RUC/RTN a `nit`; país distinto de CO queda `requiere_confirmacion` con nota de identificador extranjero. |
| RN2 — datos bancarios solo si la plantilla los pide | El mapeo se realiza sobre etiquetas presentes en la plantilla; los datos bancarios se excluyen siempre del borrador de correo. |
| RN3 — soporte ausente/vencido bloquea firma | Checklist marca cada soporte; `listo_para_firma=false` si falta o venció alguno exigido. |
| RN4 — confirmación antes de acción externa | La interfaz pregunta y el código solo escribe el marcador de envío simulado al recibir confirmación. |
| RN5 — log por ejecución | Se agrega JSONL en `out/reto-01/<caso>/log.jsonl`. |

La parte más sensible es no confundir el identificador fiscal colombiano con el de otra jurisdicción. Se conserva el NIT maestro solo como referencia y se exige confirmación cuando el cliente es extranjero.

## 6. Diseño de automatización de portales web
Para portales autenticados usaría Playwright aislado en un worker con perfil de navegador efímero, selectores accesibles y validación visual/DOM antes de escribir. No intentaría eludir CAPTCHA ni MFA; cuando aparezcan, el flujo se pausa para que el humano los resuelva. Las credenciales las introduce el usuario mediante un gestor de secretos o formulario seguro, nunca en el prompt, repositorio o logs. El agente puede preparar y rellenar campos no sensibles y mostrar una vista previa; el humano valida identidad, ingresa credenciales y pulsa el botón final de envío. Un cambio de layout o una ambigüedad detiene el proceso en vez de continuar a ciegas.

## 7. Decisiones y trade-offs
1. Generar XLSX desde la plantilla JSON normalizada en vez de modificar un binario inexistente en fixtures: reproduce hojas/celdas requeridas, pero no conserva estilos de un original que no fue suministrado.
2. Usar mapeo exacto + glosario normalizado en vez de similitud semántica libre: más trazable, aunque requiere mantener el glosario.
3. Separar paquete y envío: evita acciones irreversibles y deja evidencia auditable, a costa de una confirmación adicional.

## 8. Supuestos
- La fecha de evaluación es la fecha del sistema.
- Los soportes en `repositorio/soportes/` son placeholders de texto para la prueba.
- La plantilla normalizada JSON define el orden y las celdas; no hay XLSX/PDF original binario.
- Los datos ficticios del maestro son autoritativos para el ejercicio.

## 9. Cobertura
| Historia | Estado | Pendiente para producción |
|---|---|---|
| HU-1 Leer solicitud y plantilla | Hecho para los fixtures | Mejor manejo de plantillas corruptas y validación de esquema |
| HU-2 Mapear campos | Hecho con glosario y trazabilidad | Revisar cobertura de sinónimos y añadir pruebas |
| HU-3 XLSX/PDF/portal | XLSX y PDF generados; portal produce Markdown | Reproducir estilos exactos cuando se disponga de binarios |
| HU-4 Paquete de firma | Checklist, soportes disponibles y borrador | Firmas digitales e integración documental |
| HU-5 Errores legibles | Manejo básico `{ok,error}` | Pruebas unitarias y de resiliencia |

## 10. Uso de IA
Se usó ChatGPT para interpretar el PRD, estructurar y revisar el código inicial y redactar documentación. Se mantuvieron las decisiones de negocio en código determinista. Cualquier sugerencia no respaldada por fixtures se descartó.

## 11. Riesgos y mitigación
- **Soportes vencidos o incompletos:** bloquear firma y mostrar checklist.
- **Filtración de datos bancarios:** no incluirlos en el correo ni logs; limitar acceso a artefactos.
- **Cambio de plantilla:** versionar plantillas y validar celdas antes de escribir.
- **Alucinación del modelo:** solo valores de herramientas, con fuente; el modelo no crea valores faltantes.
- **Portal cambiante:** detección de cambios y escalamiento al humano.
