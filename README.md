# Dedos Shop Utilities Bot

Bot de Discord construido con [discord.js v14](https://discord.js.org/#/) siguiendo principios SOLID y un sistema de comandos con prefijo configurable (`;` por defecto) combinado con interacciones modernas.
Ofrece verificación, mensajes de bienvenida, sistema de warns con MySQL, panel de tickets, recordatorios de eventos y menús de ayuda.

## Requisitos
- Node.js **18.17** o superior
- Dependencias instaladas con `npm install`
- Base de datos MySQL (opcional para warns y recordatorios)

## Puesta en marcha
```bash
npm install
npm start
```

Configura las variables de entorno en un archivo `.env` (puedes usar `.env.example` como referencia) e incluye al menos:

| Variable | Descripción |
| --- | --- |
| `BOT_TOKEN` | Token del bot de Discord. |
| `COMMAND_PREFIX` | Prefijo de texto para los comandos (por defecto `;`). |
| `VERIFIED_ROLE_ID` | Rol asignado al completar la verificación. |
| `VERIFICATION_CHANNEL_ID` | Canal donde se publica el mensaje de reglas/verificación. |
| `INVITE_CHANNEL_ID` | Canal de invitaciones utilizado en los mensajes de bienvenida. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Credenciales MySQL (opcional, pero requeridas para warns y recordatorios). |

Consulta `config/index.js` para el listado completo de opciones disponibles (colores, URLs, límites de tickets, recordatorios, etc.).

## Comandos disponibles
Los comandos de texto se ejecutan escribiendo el prefijo seguido del comando en cualquier canal donde tengas permisos:

| Comando | Descripción |
| --- | --- |
| `;reglas [#canal|canal_id]` | Publica el mensaje de reglas con botón de verificación y menú de ayuda. |
| `;tickets [#canal|canal_id]` | Publica el panel de selección para abrir tickets. |
| `;evento` | Publica el panel de inscripción al evento configurado. |
| `;warn @usuario [--puntos <1-10>] [--contexto <url>] razón` | Registra una advertencia en la base de datos y notifica al usuario. |
| `;warns @usuario [limite]` | Consulta el historial de advertencias de un usuario. |
| `;verbalwarn @usuario mensaje` | Envía una advertencia verbal por DM sin registrarla. |

## Estructura del proyecto
```
config/      # Normalización de variables de entorno y constantes del bot
commands/    # Comandos con prefijo (uno por archivo)
events/      # Listeners de eventos de Discord
services/    # Lógica de negocio (welcome, tickets, warns, eventos, FX, verificación, etc.)
utils/       # Utilidades compartidas (logger, parseo de env, embeds, permisos)
index.js     # Punto de entrada: crea el cliente y registra comandos/eventos
```

## Servicios principales
- **WelcomeService**: gestiona la cola rate-limited de mensajes de bienvenida.
- **VerificationService**: genera el embed de reglas, administra el botón de verificación y persiste el ID del mensaje.
- **TicketService**: ofrece el panel de tickets, crea canales, aplica permisos y cierra tickets mediante botones.
- **WarnService**: registra warns en MySQL, genera embeds e informa por DM a los usuarios sancionados.
- **EventService**: publica eventos, administra el rol de participantes y envía recordatorios automáticos por canal.
- **FxService**: actualiza de forma periódica la tasa MXN→USD para los precios del panel de tickets.

Cada servicio expone métodos pequeños y reutilizables que son orquestados desde los comandos y eventos.

## Logs y estado
- Los logs se almacenan en `logs/` utilizando [winston](https://github.com/winstonjs/winston) con rotación diaria.
- El ID del mensaje de verificación se guarda en `config/state.json` (excluido del control de versiones).

## Mantenimiento 24/7
El bot está pensado para ejecutarse en supervisores como PM2, systemd o contenedores. Ante errores fatales o rechazos sin capturar, estos se registran con claridad y el proceso finaliza con código distinto de cero para permitir reinicios controlados.
