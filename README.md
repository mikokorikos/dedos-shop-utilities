# Dedos Shop Bot

Bot modular para la comunidad **Dedos Shop** que centraliza middleman, warns, tickets y observabilidad bajo un mismo flujo.

## 🚀 Resumen rápido

- **Middleman guiado** con paneles, validación de Roblox, confirmaciones independientes, reclamo por botón y cierre con reseñas.
- **Warns escalables** con sanciones automáticas (timeouts/ban), notificaciones por DM y registro en MySQL.
- **Tickets generales** con límites por usuario, cooldowns y avisos automáticos al staff.
- **Branding obligatorio**: cada embed viaja con `dedosgif.gif`, color morado y textos corporativos.
- **Permisos estrictos**: solo quienes tengan `ADMIN_ROLE_ID` pueden ejecutar comandos (slash o prefijo `;`).
- **Observabilidad**: logs `[FLOW]`, `[INFO]`, `[WARN]`, `[ERROR]` en cada paso crítico.
- **Migraciones automáticas** + script SQL manual (`sql/schema.sql`).

## 📂 Arquitectura del proyecto

```
config/             # Configuración y validación de .env
events/             # Listeners de Discord (ready, interactions, mensajes, etc.)
features/           # Middleman, tickets y warns (lógica + UI)
services/           # MySQL (pool, migraciones y repositorios)
utils/              # Branding, permisos, cooldowns, colas, helpers y logs
scripts/            # Registro de slash commands
sql/                # Esquema SQL para creación manual de tablas
index.js            # Bootstrap del bot
```

## ⚙️ Puesta en marcha

1. **Clona** el repositorio y duplica `.env.example` a `.env`.
2. **Completa** las variables: token de Discord, IDs de roles, configuración MySQL, ruta de `dedosgif.gif` (opcional `DEDOS_GIF`). Las configuraciones dinámicas (como el canal de reseñas) viven en `config/runtime.json` y se administran con el comando `/config`.
3. **Instala dependencias**:

   ```bash
   npm install
   ```

4. (Opcional) **Registra comandos slash** globales o por servidor:

   ```bash
   npm run register:commands
   ```

5. **Inicia el bot**:

   ```bash
   npm start
   ```

> Al primer arranque se verifica la conexión MySQL, se ejecutan migraciones y se deja el bot listo con presencia `Watching Dedos Shop`.

## 🧾 Comandos disponibles

| Tipo | Comando | Descripción | Permisos |
| ---- | ------- | ----------- | -------- |
| Slash | `/middleman` | Publica el panel de middleman | Solo admins |
| Prefijo | `;middleman` | Idéntico a slash, vía prefijo | Solo admins |
| Slash | `/mm` | Gestiona middlemans (`add`, `set`, `stats`, `list`, `closeforce`) | Admins (closeforce disponible para middleman reclamante) |
| Prefijo | `;mm` | Versión prefijo del comando de gestión | Admins (closeforce disponible para middleman reclamante) |
| Slash | `/tickets` | Publica panel de tickets generales | Solo admins |
| Prefijo | `;tickets` | Versión prefijo del panel de tickets | Solo admins |
| Slash | `/warn`, `/removewarn`, `/warns` | Gestiona warns | Solo admins |
| Prefijo | `;warn`, `;removewarn`, `;warns` | Idéntico a slash | Solo admins |

Los usuarios que no tengan el rol configurado reciben un embed con el gif y el mensaje **“⛔ Permisos insuficientes”**.

## 🛡️ Middleman paso a paso

1. **Publicar panel** (`/middleman` o `;middleman`).
2. Los traders ven un menú con dos opciones:
   - `📖 Cómo funciona`: instrucciones resumidas (embed + gif).
   - `🛠 Abrir middleman`: lanza un modal para indicar partner y contexto.
3. **Validaciones automáticas** al enviar el modal:
   - Límite de tickets abiertos por usuario (`MM_MAX_TICKETS_PER_USER`).
   - Cooldown por usuario (`MM_TICKET_COOLDOWN_MS`).
   - El partner debe existir en el guild y ser distinto del solicitante.
4. **Creación del canal** (nombre normalizado + categoría opcional) con permisos para traders, admins y middleman role. Si algo falla (ej. permisos insuficientes) el canal se elimina y se responde con el embed **“❌ No se pudo crear el canal”**.
5. Se genera el registro en MySQL y se publica el panel del trade con botones:
   - `📝 Mis datos de trade`: modal con usuario de Roblox + items. Valida la existencia en Roblox e informa con embed amarillo si la cuenta tiene < 1 año.
   - `✅ Confirmar trade`: marca la confirmación individual (solo si el usuario ya registró datos).
   - `🚨 Pedir ayuda`: desbloquea temporalmente el canal, menciona al staff y luego relockea automáticamente.
6. Cuando ambos confirman, el canal se bloquea, los botones se desactivan y se notifica al rol `MM_ROLE_ID` con el embed **“🔒 Trade listo para middleman”**, además de publicar el botón **“Reclamar Middleman”**.
7. Un middleman registrado puede reclamar el ticket (se verifica rol/DB), se genera una tarjeta visual con `@napi-rs/canvas` y se registra la relación en `mm_claims`.
8. El middleman obtiene un botón **“Solicitar reseñas”** para lanzar el flujo de calificación. El bot pingea a los traders con un embed y el botón **“Dejar reseña”** (modal con estrellas 0-5 + comentario opcional).
9. Cada reseña se guarda en `mm_reviews`, se publica automáticamente en el canal configurado en `config/runtime.json` (comando `/config set reviewsChannel`) con la tarjeta del middleman y se recalcula el promedio de estrellas. Cuando todos los traders reseñan se suma un `vouch` y se envía el embed **“TRADE COMPLETADO”** con un resumen de lo entregado por cada parte.
10. Si los traders confirmaron pero no dejan reseña, el middleman o un admin pueden ejecutar `/mm closeforce` para cerrar el trade igualmente (se publica el embed final y se deja log `[WARN]`).

### Errores y avisos esperados en middleman

| Situación | Embed / Mensaje | Acción sugerida |
| --------- | ---------------- | --------------- |
| Usuario excede límite | **“⛔ Límite de tickets”** | Cerrar tickets abiertos antes de crear otro. |
| Cooldown activo | **“⌛ Espera un momento”** | Esperar los segundos indicados. |
| Partner no encontrado | **“❌ No encontramos al partner”** | Verificar que el usuario esté en el servidor y escribir correctamente. |
| Partner = solicitante | **“❌ Partner inválido”** | Seleccionar a la otra persona del trade. |
| Roblox no existe / error API | **“❌ Usuario de Roblox no encontrado”** | Revisar ortografía o intentar más tarde si la API falló. |
| Roblox < 1 año | **“⚠️ Roblox con poca antigüedad”** (aviso en canal) | Extremar precauciones, especialmente con Robux. |
| Error creando canal (permisos, DB, etc.) | **“❌ No se pudo crear el canal”** | Revisar permisos del bot en la categoría y estado de MySQL. |

## 🎫 Tickets generales

- Panel (`/tickets` o `;tickets`) con select para `buy`, `sell`, `robux`, `nitro`, `decor`.
- Cada usuario respeta límite (`TICKET_MAX_PER_USER`) y cooldown (`TICKET_COOLDOWN_MS`).
- Al abrirse un ticket:
  - Se crea canal privado (categoría opcional).
  - Se registra en la DB y se agrega al dueño como participante.
  - Se envía embed de bienvenida mencionando a `ADMIN_ROLE_ID` + roles de soporte configurados.
- Errores habituales: límite (embed “⛔ Límite de tickets”), cooldown (“⌛ Cooldown activo”), tipo inválido (“❌ Error al crear ticket”).

## 🚨 Warns y sanciones

- Comandos slash y prefijo aceptan menciones o IDs.
- Cada warn almacena motivo, severidad (auto `minor` salvo que el motivo incluya `#major`, `#critical` o `!ban`).
- Escalado automático:
  - 3 / 6 / 12 warns → timeout 24h.
  - 18 warns → timeout 7 días.
  - >18 warns → +1 día por warn extra.
  - `#critical` o `!ban` → ban inmediato (try/catch con log si falla).
- El moderador recibe embed en canal con totales y próxima sanción; el usuario recibe DM (cola rate-limited). Si los DMs fallan, se registra `[WARN] No se pudo enviar DM de warn`.
- `;removewarn` y `/removewarn` eliminan los warns más recientes.

## 🗄️ Base de datos

- El bot ejecuta migraciones en cada `ready`. Las tablas principales son `users`, `warns`, `tickets`, `ticket_participants`, `mm_trades`, `middlemen`, `mm_reviews`, `mm_claims`.
- Para creación manual o auditorías usa [`sql/schema.sql`](sql/schema.sql).
- Conexión vía pool (`mysql2/promise`) con reintentos automáticos (`p-retry`).

## 🧰 Utilidades adicionales

- **Branding centralizado** en `utils/branding.js` (`applyDedosBrand`, `createDedosAttachment`).
- **Guardias de permisos** (`utils/guard.js`) aplican validaciones, cooldowns y devuelven embeds de error.
- **Cooldowns y colas** (`utils/cooldowns.js`, `utils/queue.js`) para evitar spam y rate limit de DMs.
- **Logger** (`utils/logger.js`) con niveles `[FLOW]`, `[INFO]`, `[WARN]`, `[ERROR]`, `[DEBUG]`.
- **Bienvenida por DM**: configurable mediante variables `WELCOME_*` (cola rate-limited para evitar bloqueos de Discord).

## 🧪 Scripts útiles

- `npm run register:commands` — Registra slash commands (usa `CLIENT_ID` y opcional `GUILD_ID`).
- `npm start` — Arranca el bot en modo producción.

## 🔧 Resolución de problemas

| Problema | Síntoma | Solución |
| -------- | ------- | -------- |
| Variables `.env` incompletas | Error al iniciar: “Variables de entorno faltantes” | Revisar `.env`, especialmente `TOKEN`, `ADMIN_ROLE_ID`, `MM_ROLE_ID`. |
| MySQL inaccesible | Logs `[WARN] Intento de conexión MySQL falló` o `[ERROR] No se pudo iniciar sesión` | Validar credenciales, host, firewall y ejecutar manualmente `sql/schema.sql` si es necesario. |
| Bot sin permisos en categoría | Embeds “❌ No se pudo crear el canal” al abrir middleman/ticket | Dar permisos de `Manage Channels` y `Manage Roles` al bot en la categoría destino. |
| Falta `dedosgif.gif` | Discord devuelve error al intentar enviar embed | Colocar `dedosgif.gif` en raíz o definir `DEDOS_GIF` apuntando a la ruta absoluta. |
| API Roblox inestable | Embeds “❌ Usuario de Roblox no encontrado” incluso con nombres válidos | Esperar unos minutos (el bot captura el error y lo informa como inexistente). |

## ✅ Requisitos

- Node.js **18+**.
- Bot con permisos de `Manage Channels`, `Manage Roles`, `Send Messages`, `Use Application Commands`, `Manage Threads` (recomendado), `Read Message History`.
- Acceso a una base MySQL con las tablas del esquema incluido.

Con esto tienes una visión completa de lo que hace el bot, cómo operarlo y cómo reaccionar ante los errores esperados.
