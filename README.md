# Seguimiento de Obra Adrio III

Calendario público de las cuatro plantas de viviendas y los dos sótanos de Adrio III. El cambio de escenario es local. Las fechas son estimaciones mensuales. Una fase completada representa un hito confirmado por el administrador. El recuento de fases no mide el porcentaje de obra ejecutada.


## Portal para residentes · actualización de noviembre de 2026

El portal distingue el calendario inicial, una copia de la última publicación, los borradores de administración y los datos recién leídos. El calendario abre en el escenario realista y permite consultar el optimista o comparar ambos. La previsión mide tiempo y los hitos cuentan confirmaciones. El modelo conserva la precisión mensual del calendario de origen. Las observaciones del diario tienen precisión diaria.

**Activación en un proyecto existente**

1. En Supabase, abre **SQL Editor → New query**. Ejecuta `select to_regprocedure('public.adrio_is_admin()'), to_regprocedure('public.adrio_forecasts()');`. Un resultado nulo identifica una función ausente. Realiza el preflight y la copia descritos más abajo. Conserva el UUID de la cuenta existente.
2. Si falta la primera función, ejecuta **migrations/001_production.sql**. Si falta la segunda, ejecuta después **migrations/002_resident_portal.sql**. Cada archivo se ejecuta completo una sola vez. Si detectas una instalación parcial o un error, revisa el inventario antes de repetir. El SQL inicial de la carpeta de pruebas es exclusivamente una referencia.
3. Tras aplicar 002, ejecuta **migrations/003_daily_photos.sql** completa una vez. Reutiliza la cuenta administradora existente. Comprueba el resultado con `select * from public.adrio_photo_index();`. Una tabla vacía es normal si aún no se han publicado fotos. El bucket privado `adrio-diary` conserva las fotos antiguas. Antes de cambiar una instalación existente, guarda una copia de la base y del bucket. Ejecuta **migrations/004_photo_moderation.sql** una vez después de 003. Desde la sesión admin de la aplicación, comprueba `select * from public.adrio_pending_photos();` mediante el RPC correspondiente. Una cola vacía es un resultado válido.
4. En **Authentication → Sign In / Providers**, comprueba que Email esté activo y las altas públicas estén desactivadas. En **Users**, verifica la cuenta confirmada y su contraseña. La autorización procede de `adrio_is_admin()`. No hace falta incluir un identificador de usuario en la configuración del navegador.
5. Con el frontend en ensayo, abre la sesión administradora, previsualiza y publica una observación de prueba. Desde un perfil de visitante comprueba la fotografía, filtra por fase y compara dos fechas. Retira la publicación en ensayo y verifica su desaparición al actualizar. Prueba el registro de hitos y la restauración en la copia. La tabla pública del calendario y el RPC del histórico resumido no exponen los borradores ni los datos de Auth.
6. Aplica primero 004 y publica después el frontend compatible en `main`. Pages sirve `main /(root)`. Si necesitas revertir la interfaz, revierte su commit y conserva 004 y la cola. La interfaz anterior no confirma los envíos pendientes ni muestra los controles de moderación. Recupera esos controles desplegando de nuevo un frontend compatible con 004.

**Álbum por días.** El visitante envía una foto a una cola privada de hasta 3 pendientes en total, aunque sean de días distintos. En **Administración → Fotos pendientes**, el administrador puede aprobarla para el día del envío o rechazarla. Supabase asigna las plazas al publicar, con un máximo de tres por día según la hora de Madrid. Si el día de hoy está completo, se bloquean también los envíos de hoy. Las subidas del administrador desde el álbum y el diario se publican directamente si hay plaza. Al eliminar una foto publicada se libera su plaza. Si era antigua, se retira del álbum y sigue disponible en su observación original.

El navegador convierte JPEG, PNG o WebP de hasta 12 MiB a JPEG de hasta 1440 píxeles de lado mayor y 160 KiB, y elimina los metadatos. La portada muestra la última imagen publicada. El álbum se puede ver por día, por mes o por fase; las fotos se asignan a cada fase por fecha según el calendario realista. Los marcadores mensuales del Gantt abren el álbum de ese mes.

**Copias.** Los nuevos JPEG se guardan en PostgreSQL en `adrio_private.daily_photos`. Con tres JPEG del tamaño máximo se guardan hasta 480 KiB de imagen por día. Incluye esta tabla, la cola `adrio_private.photo_queue`, el diario, los comentarios y el contenido histórico del bucket en las copias de seguridad. La exportación JSON del calendario contiene la planificación. Una foto nueva adjunta a una observación también se publica en el álbum diario y permanece allí si se retira la observación.

**Comentarios.** En el diario, la sesión administradora permite publicar texto con fecha y eliminarlo. Los comentarios y las observaciones se muestran juntos en un único diario ordenado por fecha; el filtro por fase muestra solo observaciones. Las explicaciones anteriores se incorporan al diario con la fecha de su revisión.

**Sin conexión.** Tras una visita con conexión, el trabajador de servicio conserva los archivos estáticos permitidos y el navegador conserva la última planificación pública validada. El histórico y las fotos requieren conexión tras recargar. La caché excluye configuración, respuestas de Auth y API, fotografías y URLs de sesión. Los borradores del administrador mantienen su almacenamiento separado por proyecto y cuenta. Cuando cambien los archivos estáticos, incrementa la versión de caché en `sw.js`. Si cambias de proyecto, actualiza también el origen de caché pública en la etiqueta `adrio-cache-origin` del HTML.

## Probar en el ordenador

Desde la carpeta del repositorio, ejecuta `python3 -m http.server 8080 --bind 127.0.0.1` y abre `http://127.0.0.1:8080`. El frontend estático funciona sin compilación ni instalación de paquetes. La configuración incluida apunta al proyecto real. Para probar escrituras utiliza otro proyecto o las pruebas simuladas.

## Modelo y archivos

| Archivo | Responsabilidad |
|---|---|
| `config.js` | URL base y clave pública existente |
| `index.html`, `style.css` | Panel, diálogos, tema y política CSP |
| `src/schedule.js` | Calendario por meses, dependencias, solapamientos, validación y lectura del formato original |
| `src/chart.js` | Fases y eje temporal, edición con puntero, cambio confirmado al soltar |
| `src/app.js` | Sesión, formularios, selección de escenario, copias y vistas previas |
| `src/backend.js` | Cliente de Supabase, lectura de la fila pública y llamadas RPC |
| `src/sync.js` | Revisión publicada, borrador pendiente, reintentos y conflictos |
| `vendor/` | Supabase JS 2.119.2 y licencia MIT. Para actualizar, sustituye el archivo por la distribución UMD de una versión exacta, actualiza la referencia y repite las pruebas |
| `migrations/` | Inventario de solo lectura y migración transaccional 001 |
| `tests/` | Pruebas de dominio, sincronización, navegador y PostgreSQL |

El mes cero es diciembre de 2026. El fin es exclusivo. Una fase que va de diciembre a marzo dura tres meses. Cada fase depende de la anterior. Las tablas de solapamiento de `schedule.js` y la validación SQL tienen que coincidir. Al editar se conserva la holgura adicional de cada descendiente. La previsión realista y la optimista se editan por separado. Confirmar un hito copia las fechas al otro escenario y bloquea ambos. Una incompatibilidad con las dependencias exige revisar las fechas antes de confirmar. La aplicación admite inicios desde cinco años antes de la base y fines hasta veinte años después.

La fila 1 de `public.schedule` contiene la publicación. La lectura convierte el formato original en memoria. La primera publicación del administrador guarda la versión 2 y una proyección compatible con el lector anterior. La base comprueba la revisión, conserva la versión previa e incrementa el número en una sola transacción. Un cambio de escenario no entra en este flujo.

## Preparar Supabase y verificar el esquema existente

1. En el proyecto correcto, abre **Connect** y copia la Project URL. En **Settings → API Keys** identifica la publishable key. Comprueba ambos valores en `config.js`. La URL debe terminar en `.supabase.co`, sin `/rest/v1/`, `/auth/v1/`, parámetros o fragmentos. Si cambias de proyecto, actualiza también el host de `connect-src` en `index.html`. Conserva los valores actuales para Adrio III.
2. En **SQL Editor → New query** ejecuta `migrations/preflight.sql`. Conserva los resultados en privado. El archivo original de creación se conserva en `tests/fixtures/original-setup.sql` con el marcador de UUID. Se usa para pruebas locales. En una base existente se aplican las migraciones pendientes en orden. Comprueba la fila 1, el tipo JSON de estado, las columnas del historial y sus marcas de tiempo. Revisa todas las funciones, vistas, reglas de acceso y disparadores que permitan leer historial o modificar esas tablas. Si existen rutas adicionales con permisos elevados, ajusta la migración en una copia antes de aplicarla. Comprueba también las concesiones heredadas de otros roles.
3. Haz una copia privada de datos y esquema. Desde **Connect**, usa los datos de la conexión directa o el *session pooler*. Con el cliente PostgreSQL compatible y las variables libpq `PGHOST`, `PGPORT`, `PGDATABASE` y `PGUSER` configuradas, ejecuta `pg_dump -W -Fc -n public -f adrio-antes.dump`. Guarda la copia fuera del repositorio. Restaura primero en una base de ensayo que ya contenga Auth y los roles de Supabase. Para copias posteriores incluye también `-n adrio_private`.
4. Compara el inventario con el esquema original: `schedule_history(revision bigint primary key, state jsonb, updated_at timestamptz)` y `save_schedule(bigint,jsonb)`. Contrasta el UUID de esa función con el de la nueva función de autorización. Revisa cualquier restricción o disparador existente que exija campos de estado concretos. La migración está pensada para un proyecto dedicado. Cambia también los privilegios predeterminados del rol que la ejecuta para futuros objetos. Revisa el efecto en otras aplicaciones si comparten base.
5. En **Authentication → Sign In / Providers**, habilita el proveedor Email y desactiva **Allow new users to sign up** y los accesos anónimos de Auth. La lectura pública funciona con la clave pública. En **Authentication → Users**, verifica el correo y el UUID de la única cuenta administradora. El UUID debe coincidir con el que comprueba `adrio_is_admin()` en la migración 001. Si es una instalación nueva, **Add user → Create new user**, introduce correo y contraseña, confirma la cuenta y usa su UUID en la función de autorización. Para la instalación existente conserva su UUID.
6. Si la cuenta existente se creó mediante enlace mágico y carece de contraseña, asígnala una vez mediante la administración de usuarios. Si tu panel no ofrece esa edición, utiliza la operación oficial `auth.admin.updateUserById(uuid, {password})` desde un entorno administrativo privado con el SDK y una clave secreta. Introduce el secreto y la contraseña mediante el gestor de secretos de ese entorno. No los pongas en el sitio, el historial de comandos, Git ni capturas. Confirma que el correo de la cuenta pertenece al administrador.
7. En el **SQL Editor** de ensayo, abre una nueva consulta, pega el archivo completo `migrations/001_production.sql` y pulsa **Run** una vez como propietario. Si falla, la transacción se revierte. Revisa el error antes de repetir. La migración conserva los registros, cierra el RPC antiguo, restringe ambas tablas y añade las revisiones nuevas a la misma tabla `public.schedule_history`. Solo el RPC autorizado puede publicar o restaurar. Conserva `adrio_private` fuera de los esquemas expuestos por la Data API.
Después de 001, ejecuta `migrations/002_resident_portal.sql` completa en otra consulta. Crea el diario, el histórico público resumido y el bucket privado con sus políticas. Revisa las instrucciones del portal al inicio de este documento.

8. Sirve una copia del frontend con la URL, clave y CSP de ensayo; configura el UUID de ensayo en la base. Abre una ventana privada, cambia el escenario y comprueba que solo hay lecturas de `schedule`. Entra con una cuenta distinta del administrador y verifica la vista de lectura. Entra con el administrador, cambia un mes, recarga, comprueba la publicación desde otra ventana y restaura la revisión desde **Historial**. Repite con dos ventanas editando la misma revisión para comprobar el conflicto. El SQL Editor con rol propietario no reproduce las restricciones de un visitante.
9. Con la copia verificada y autorización para el despliegue, repite los pasos de copia, Auth y migración en producción. Guarda la salida del preflight y la revisión anterior para poder comparar. Ejecuta la migración antes del cambio de frontend.

### Aviso por correo de fotos pendientes y fotos con fecha (migración 005)

`migrations/005_notify_and_dated_photos.sql` añade dos cosas:

- **Aviso por correo.** Cuando un visitante deja una foto en la cola, la base de datos envía un correo al administrador con la foto adjunta y un enlace «Revisar foto» (`?revisar=<id>`). El enlace abre la web, pide iniciar sesión si hace falta y señala esa foto en **Fotos pendientes**. No se puede aprobar desde el correo sin iniciar sesión. Como la cola admite 3 fotos, nunca llegan más de 3 avisos seguidos sin revisar.
- **Fotos del administrador con fecha.** `adrio_add_photo_on` permite al administrador publicar en cualquier día entre el 1 de enero de 2020 y hoy, con el mismo límite de 3 fotos por día. En la web puede elegir varias fotos a la vez; cada una toma la fecha de la cámara (EXIF) o, si no la tiene, la del archivo, y se puede cambiar antes de publicar.

Pasos, una sola vez:

1. Crea una cuenta en [Resend](https://resend.com) con el correo donde quieres recibir los avisos. En **API Keys** crea una clave con permiso **Sending access** (solo envío).
2. En el **SQL Editor** de Supabase guarda la clave y tu correo en Vault. No los pongas en el repositorio:
   `select vault.create_secret('re_...', 'adrio_resend_key');`
   `select vault.create_secret('tu-correo@ejemplo.com', 'adrio_notify_to');`
   Sin un dominio verificado en Resend, el remitente es `onboarding@resend.dev` y solo puede enviar al correo de tu cuenta de Resend. Si verificas un dominio, guarda también el remitente: `select vault.create_secret('Adrio III <avisos@tu-dominio.com>', 'adrio_notify_from');`
3. Ejecuta `migrations/005_notify_and_dated_photos.sql` completa, una vez, después de 004. Activa la extensión `pg_net` si no lo estaba.
4. Prueba: desde una ventana privada envía una foto. Debe llegarte el correo en uno o dos minutos. Si no llega, consulta `select status_code, error_msg, content from net._http_response order by created desc limit 5;` (las respuestas se guardan unas horas).

La clave viaja en la cabecera de la petición, y pg_net guarda las peticiones pendientes en `net.http_request_queue` hasta enviarlas. La migración retira el acceso a esas tablas a los roles de la web, pero cualquier rol con acceso directo a la base podría leerla mientras tanto. Por eso conviene una clave de solo envío. Para cambiar la clave, el correo o desactivar los avisos, edita o borra los secretos desde la sección **Vault** del panel de Supabase (o con `vault.update_secret`); sin secretos no se envía nada y las fotos siguen entrando en la cola.

[Configuración de Auth](https://supabase.com/docs/guides/auth/general-configuration) · [Contraseñas](https://supabase.com/docs/guides/auth/passwords) · [Administración de una cuenta existente](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)

## Publicar y volver atrás

1. Guarda el SHA servido antes del cambio y el origen de publicación de **GitHub → Settings → Pages**. La versión anterior publicada es `dc6def9`. Revisa los cambios en `feature/resident-portal`, ejecuta las pruebas y abre una pull request hacia la rama que publica Pages.
2. Tras verificar la copia y aplicar la migración autorizada, fusiona la pull request. Si Pages ya publica este repositorio, conserva su origen. Para habilitarlo desde cero, elige **Settings → Pages → Build and deployment → Deploy from a branch**, selecciona la rama aprobada y **/(root)** y pulsa **Save**. Espera al despliegue correcto en **Actions**.
3. Abre la URL pública en una ventana privada. Deben aparecer siete fases y una fecha de publicación. En **Network**, la lectura debe terminar en `/rest/v1/schedule` y devolver 200. Comprueba ambos escenarios y un enlace de WhatsApp en el móvil. Ensaya las operaciones de escritura en la copia de pruebas.
4. Ante un fallo visual, prepara una PR con los archivos estáticos del último despliegue bueno y conserva la URL base corregida. **Para volver al prototipo d8b8b6f usa solo una vista pública de emergencia**. Su HTML anterior insertaba datos sin escapar y compartía la URL completa. Es preferible volver a la última revisión endurecida o corregir la rama actual. La migración mantiene el formato de lectura antiguo y bloquea sus escrituras. Mantén cerrados los permisos anteriores.
5. Si el problema son las fechas, usa **Historial → Revisión → Confirmar restauración**. Esto crea una revisión. Si el problema es el esquema, conserva el volcado y prepara una migración correctiva verificada en la copia. Una restauración completa del volcado sobre producción podría perder revisiones posteriores.

[Configuración de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Operación y recuperación

- El estado inicial sin conexión permite consultar ambos escenarios. Si una lectura posterior falla, se conserva en memoria la última publicación confirmada con su fecha. Para una carga totalmente desconectada también deben estar disponibles los archivos del sitio.
- El administrador edita una publicación verificada. Al soltar la barra, confirmar el mes o marcar un hito, el navegador conserva el borrador con su revisión, URL del proyecto y UUID. El cliente espera la confirmación del servidor antes de registrar el guardado. Una pestaña visible comprueba la publicación cada minuto y vuelve a comprobarla al recuperar conexión o visibilidad.
- Ante un conflicto, exporta el borrador JSON, descártalo para cargar la última publicación y revisa las diferencias antes de volver a editar. Importar una copia completa permite restaurar los dos escenarios y los hitos históricos. Revisa la vista previa y confirma solo la revisión que deseas publicar. Mantén una única pestaña editora por perfil de navegador para evitar que dos borradores locales compartan almacenamiento. Usa perfiles distintos para probar edición concurrente.
- Los navegadores privados pueden borrar los cambios locales al cerrar. Si el almacenamiento falla, exporta el JSON antes de salir. El prototipo dejaba borradores sin identificación de propietario en la clave `adrio-pending`. Si existe uno, conserva en privado el objeto `pending` de esa clave e impórtalo manualmente después de comprobar su procedencia y revisar la vista previa.
- Si falla el acceso, comprueba correo confirmado, contraseña, UUID, proveedor Email, red y disponibilidad del proyecto. Un error de permisos al verificar el administrador puede indicar que falta la migración. Tras corregirla vuelve a iniciar sesión. Las operaciones normales de acceso no envían correo.
- Si aparece un error de conexión, comprueba el host en la red del navegador, la clave pública, el CSP y la fila 1. Un 404 con ruta duplicada apunta a una URL base incorrecta. Una fila ausente o un estado inválido necesitan revisión en SQL Editor. Evita inicializar o sobrescribir la base para salir de ese error.
- En Free, revisa **Usage** y conserva copias externas periódicas. Supabase puede pausar proyectos con poca actividad durante siete días. Para reactivarlo selecciona el proyecto pausado en el panel y pulsa **Restore project** si está disponible. Comprueba la fecha de restauración que muestre el panel. Cuando vuelva a estar activo, recarga y verifica la publicación. [Disponibilidad y copias en Free](https://supabase.com/docs/guides/deployment/going-into-prod)
- El CSP se entrega mediante una etiqueta meta. Pages no ofrece configuración de cabeceras HTTP propias para este sitio. Directivas como `frame-ancestors` requieren una cabecera y no se pueden aplicar desde esa etiqueta. Los sitios Pages bajo el mismo dominio comparten origen y almacenamiento web. Aloja únicamente proyectos de confianza bajo ese origen o utiliza un dominio dedicado. El SDK mantiene la sesión en el navegador. Protege el origen y el dispositivo administrador. No publiques secretos en ningún archivo servido por Pages.

## Pruebas

Con Node moderno, ejecuta `node --test tests/*.test.js`. Las pruebas adicionales usan herramientas de desarrollo opcionales. Instálalas en una copia de trabajo con `npm install --no-save --package-lock=false @electric-sql/pglite@0.3.14 playwright`. Ejecuta `node tests/postgres.mjs`, después `npx playwright install chromium` y `node tests/browser.mjs`. Puedes indicar un navegador instalado con `BROWSER_EXECUTABLE` y una carpeta de capturas con `SHOTS`. PostgreSQL usa una base efímera con datos de prueba. Playwright simula el servicio Auth y la API. La distribución del sitio no necesita ninguna de estas herramientas.
