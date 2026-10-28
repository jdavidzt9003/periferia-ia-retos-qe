# Solución integrada — tres retos técnicos

## 1. Enfoque
Se construyó un monorepo TypeScript con tres dominios aislados. Cada dominio contiene herramientas deterministas, un prompt separado, un registro de herramientas con argumentos Zod, fixtures propios y una demo ejecutable sin modelo. Un servidor Express ofrece una interfaz de chat común para probar cada flujo.

## 2. Arquitectura
```text
Browser (public/index.html)
       │ POST /api/chat
       ▼
Express API + session memory
       │
       ├── reto-01/tools.ts ── fixtures/reto-01 ── out/reto-01
       ├── reto-02/tools.ts ── fixtures/reto-02 ── out/reto-02
       └── reto-03/tools.ts ── fixtures/reto-03 ── out/reto-03
       │
       └── LlmAdapter (OpenAI opcional, clave por entorno)
```
Los prompts están en `reto-XX/agent/prompt.md`; el conocimiento del proceso se documenta en los `PRD.md` originales y en los `SOLUCION.md` por reto. La lógica de negocio está en herramientas TypeScript, no en el prompt. Los registros se escriben en `out/`; fixtures se leen sin alterarlos.

## 3. Ciclo conversacional y controles
La API determina el caso a partir de la instrucción, invoca las herramientas del dominio en secuencia y agrega a la respuesta las llamadas con argumentos y resultados. Si hay confirmación pendiente, la UI resalta el estado y la respuesta pregunta explícitamente. Con `OPENAI_API_KEY`, el adaptador OpenAI ejecuta function-calling y el servidor valida los argumentos Zod antes de ejecutar cada herramienta. Sin clave, el sistema funciona con respuestas deterministas y las demos no dependen de LLM.

**Limitación consciente:** sin `OPENAI_API_KEY`, el modo local usa orquestación determinista por intención/caso. Con la clave, el modelo selecciona herramientas mediante function-calling con un tope de 25 iteraciones. En ambos modos las herramientas son la fuente de los datos y los controles de negocio.

## 4. Modelo y costo
Proveedor opcional: OpenAI Chat Completions con `gpt-4o-mini`, seleccionado por disponibilidad y costo bajo para un modelo de propósito general. El costo real depende de tokens y precios vigentes; no se afirma una cifra fija sin medición. Para demos y reglas no se requiere modelo, por lo que su costo es cero.

## 5. Decisiones y trade-offs
1. **Herramientas deterministas primero:** reduce alucinaciones en datos tributarios, contractuales y financieros. Trade-off: menor flexibilidad para interpretar instrucciones abiertas.
2. **Archivos locales como persistencia:** cumple la restricción de no usar base de datos y facilita auditar artefactos. Trade-off: no es apropiado para concurrencia multiusuario ni despliegue horizontal.
3. **Confirmación humana para excepciones:** evita registrar datos dudosos o crear órdenes en casos excepcionales. Trade-off: añade un paso de usuario.
4. **SAP simulado:** permite demostrar controles sin credenciales ni sistema real. Trade-off: no valida conectividad, autorización ni errores de SAP.
5. **Interfaz HTML sin framework:** reduce dependencias y facilita ejecutar el prototipo. Trade-off: no ofrece un diseño de producción ni streaming.

## 6. Supuestos
- Los fixtures son datos ficticios de evaluación y se consideran la fuente autorizada.
- Las plantillas se entregan normalizadas en JSON, por lo que el Excel de salida se genera desde celdas descritas en el fixture, no desde un archivo binario original.
- Los campos ausentes no se inventan.
- La fecha de alertas del reto 02 se pasa como argumento para que la demo sea reproducible.
- No hay acceso a servicios reales de Periferia, a SAP, a correo ni a portales de proveedores.

## 7. Cobertura general
| Entregable | Estado |
|---|---|
| Front de chat, historial y llamadas visibles | Implementado |
| API de chat, sesiones en memoria y health | Implementado |
| Adaptador LLM intercambiable con OpenAI function calling | Implementado; proveedor alternativo requiere implementar la interfaz |
| Herramientas con esquemas Zod | Implementado en `reto-XX/registry.ts` |
| Demos sin modelo | Implementadas; ejecutar y revisar salida en el entorno destino |
| Registro y trazabilidad por archivos | Implementado en los flujos principales |
| Despliegue público | Pendiente; no se inventa una URL |
| Pruebas automatizadas / pipeline CI | Pendiente de añadir |
| Validación final de typecheck y demos en Node 20 | Pendiente de ejecutar después de instalar dependencias |

## 8. Uso de IA
Se utilizó ChatGPT para revisar los requisitos, estructurar la solución, generar y revisar código inicial y documentación. El código y los resultados deben revisarse por la persona que entrega el reto; no se presenta como auditoría independiente. No se copiaron claves ni datos reales.

## 9. Riesgos y mitigación
- **Extracción determinista no cubre todas las redacciones legales:** confianza por campo, revisión humana y batería de fixtures.
- **Datos sensibles en logs:** en producción registrar identificadores y resúmenes mínimos; excluir datos bancarios, contratos completos y secretos.
- **Archivos locales y concurrencia:** migrar a almacenamiento transaccional con control de versiones.
- **Acciones irreversibles:** mantener aprobación humana y registro de auditoría.
- **Integración SAP desconocida:** diseñar adaptador OData/RFC separado, autenticación administrada por vault y simulación de errores antes de habilitar creación real.

## 10. Qué falta antes de entrega final
1. Ejecutar `npm install`, `npm run typecheck` y `npm run demo`.
2. Corregir cualquier error que aparezca en el entorno Node 20.
3. Añadir pruebas automatizadas de aceptación por cada regla.
4. Desplegar y comprobar un link público, si se requiere estrictamente.
5. Revisar que cada comportamiento se pueda explicar en la defensa.
