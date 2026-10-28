# Periferia IT Group — Entrega integrada de los tres retos IA

Monorepo TypeScript para los tres retos del proceso de selección. Cada reto mantiene sus fixtures, herramientas, prompt, demo sin modelo y documento `SOLUCION.md`.

## Requisitos
- Node.js 20+
- npm 10+
- (Opcional) clave de OpenAI para explicación conversacional. La aplicación funciona sin ella mediante flujo determinista.

## Arranque local
```bash
npm install
cp .env.example .env
npm run dev
```
Abre `http://localhost:3000`. No se requiere clave para los demos de herramientas. Si defines `OPENAI_API_KEY`, el modelo solo redacta la respuesta a partir de resultados reales de las herramientas; no sustituye validaciones de negocio. Nunca se devuelve la clave por API ni se escribe en los logs.

## Demos deterministas
```bash
npm run demo:01
npm run demo:02
npm run demo:03
# o los tres:
npm run demo
```
Cada demo reconstruye su carpeta `out/reto-XX/`. Los datos de `fixtures/` no se modifican. Los demos deben ejecutarse por separado de cualquier sesión interactiva que necesite conservar el estado de salida.

## API
- `GET /api/health`: estado y proveedor configurado, sin secretos.
- `POST /api/chat`: `{ "sessionId": "demo", "challenge": "reto-01|reto-02|reto-03", "message": "..." }`.
- `GET /api/sessions/:id`: historial en memoria de la sesión.

El chat muestra el nombre de cada herramienta, sus argumentos y un resumen del resultado. La sesión vive en memoria; reiniciar el proceso la limpia.

## Estado del enlace de prueba
No se ha publicado una instancia en un hosting público desde este entorno. Para la defensa, ejecutar localmente y compartir pantalla; no presentar `localhost` como URL pública. Para obtener un enlace público, desplegar este monorepo en Render/Railway/Fly.io y configurar `PORT` y, opcionalmente, `OPENAI_API_KEY`.

## Estructura
- `reto-01/`: registro de proveedor.
- `reto-02/`: registro de contratos.
- `reto-03/`: órdenes de compra SAP simulado.
- `src/`: servidor HTTP, utilidades compartidas y adaptador de modelo.
- `public/`: interfaz de chat.
- `fixtures/`: copias de los fixtures entregados, no editar.
- `out/`: artefactos generados, excluidos del control de versiones.

## Seguridad y límites
- No se incluye `.env`, ninguna clave ni `node_modules/`.
- No se envían correos, no se firma, no se accede a portales externos y no se conecta a SAP real.
- Las herramientas son la fuente de datos; el modelo opcional únicamente redacta explicaciones.
- El proyecto es un prototipo de evaluación, no un sistema listo para producción.


### Confirmación humana y seguridad de la demo

Las confirmaciones se asocian en memoria a la sesión, al reto y al identificador del caso. Por ejemplo, después de revisar `sol-004`, escribir `confirmo` solo puede autorizar la acción pendiente de `sol-004`; no se debe ejecutar un caso por defecto. Si se cambia de reto o se menciona otro identificador, la API solicita aclaración y no ejecuta la acción. Esta memoria de confirmación vive en el proceso del servidor y se pierde al reiniciarlo.

Para probar el flujo de OC, selecciona Reto 03, envía `Procesa sol-004 y muéstrame la OC como quedaría en SAP, pero no la crees hasta que confirme`, revisa el resultado y luego responde `confirmo`. Verifica que la herramienta `oc_crear` reciba `sol-004`. Para cancelar una confirmación pendiente, escribe `cancelar`.
