# Dedos Bienvenidas Bot

Bot de Discord modularizado para dar la bienvenida por DM, gestionar reglas con verificacion por reaccion y operar 24/7 en un host supervisado (PM2, NSSM, systemd, etc.).

## Requisitos
- Node.js 18 o superior
- Dependencias instaladas con `npm install`

## Ejecucion
```bash
npm install
npm start
```

El punto de entrada `index.js` inicializa el cliente, registra los manejadores en `src/` y mantiene el bot activo con reintentos y apagado seguro.

## Variables de entorno (.env)
La mayoria de los valores se leen desde `.env` mediante `dotenv`. Ajusta segun tu servidor:

- `TOKEN` (**requerido**): token del bot de Discord.
- `LOG_LEVEL` o `DEBUG`: nivel de logging (`fatal`, `error`, `warn`, `info`, `debug`, `trace`). `DEBUG=1` habilita modo detallado.
- `VERIFIED_ROLE_ID`: ID del rol que se asignara tras la verificacion.
- `VERIFICATION_CHANNEL_ID`: canal donde se publica el mensaje de reglas y verificacion.
- `VERIFICATION_MESSAGE_ID`: opcional; se rellena automaticamente al usar `!reglas`.
- `VERIFICATION_EMOJI`: emoji (unicode, `\uXXXX` o `<:custom:id>`) que los usuarios deben reaccionar.
- `INVITE_CHANNEL_ID`: canal donde se anuncia la llegada de nuevos miembros.
- `GUILD_URL`: enlace principal del servidor (tambien usado en el boton "Servidor").
- `HELP_URL`: enlace de ayuda; por defecto usa `GUILD_URL`.
- `BRAND_ICON`: URL del icono que se muestra en los embeds.
- `WELCOME_GIF`: ruta local o URL para adjuntar un GIF en DMs y embeds.
- `WELCOME_DM_TITLE`, `WELCOME_DM_MESSAGE`: textos del embed privado de bienvenida.
- `WELCOME_CHANNEL_MESSAGE`: mensaje publico de bienvenida con soportes `{user}` y `{guild}`.
- `WELCOME_RATE_MS`: intervalo en ms entre envios de bienvenida (minimo 250 ms).
- `WELCOME_CONCURRENCY`: cantidad de DMs procesados en paralelo.
- `WELCOME_MAX_QUEUE`: tamano maximo de la cola de bienvenidas.
- `LOGIN_MAX_ATTEMPTS`: intentos maximos de login antes de abortar.
- `LOGIN_RETRY_MS`: retardo inicial entre reintentos de login.
- `LOGIN_MAX_RETRY_MS`: retardo maximo entre reintentos (por defecto 60000 ms).
- `ENV_FILE`: ruta del archivo `.env` a actualizar cuando se guarda el ID de verificacion.

## Arquitectura
- `src/app.js`: crea el cliente, registra eventos y gestiona login/apagado.
- `src/config.js`: normaliza variables de entorno y niveles de log.
- `src/utils/logger.js`: logger simple con niveles y loggers hijo por area.
- `src/queue/rateLimitedQueue.js`: cola con control de tasa y concurrencia.
- `src/services/welcomeService.js`: DM y anuncio de bienvenida con cola resiliente.
- `src/services/verificationService.js`: comando `!reglas`, reaccion de verificacion y asignacion de roles.
- `src/embeds/index.js`: generadores de embeds reutilizables.
- `src/state/verification.js`: persiste `VERIFICATION_MESSAGE_ID` en `.env`.
- `src/startup/`: login con reintentos y apagado seguro.

## Flujos principales
- `guildMemberAdd`: la cola procesa el DM privado y el mensaje en el canal configurado.
- `!reglas`: publica o actualiza el mensaje de verificacion y guarda el ID en `.env`.
- Reacciones sobre el mensaje de verificacion: asigna o remueve el rol configurado.

## Supervision 24/7
El modulo `shutdown.js` detiene de forma segura la cola y el cliente, permitiendo que un supervisor (PM2, systemd, NSSM, etc.) reinicie el proceso tras fallos. Los reintentos exponenciales de login evitan ciclos intensivos ante errores temporales.
