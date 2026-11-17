# Pasapalabra en comunidad — versión web

Juego para una actividad grupal: adultos mayores en una fundación. Mezcla preguntas de cultura general y convivencia con algunos conceptos de participación ciudadana, respeto, comunidad y pobreza. No pide a las personas compartir experiencias personales.

## Incluye

- Rosco de 27 letras (con Ñ), con **1.350 preguntas**: 50 por letra.
- Ocho preguntas sociales y 19 recreativas por ronda, elegidas automáticamente, con al menos una sobre pobreza o protección social.
- Nueva ronda con preguntas y respuestas diferentes de la ronda anterior en cada letra, siempre que haya alternativas.
- Temporizador de 3, 5, 8, 10 o 15 minutos.
- Verde/rojo en el centro por **0,7 segundos**, con colores permanentes en las letras.
- Opción de pasar palabra, mostrar/ocultar pregunta y ofrecer una pista adicional.
- Una pantalla pública sin controles y una pantalla privada de control con las respuestas siempre visibles. La persona que dirige decide cuándo mostrar una respuesta al público y si revelar el resumen final; al terminar aparece una animación de agradecimiento.
- Las dos pantallas se sincronizan por internet y **no necesitan estar en la misma red Wi-Fi**.
- Interfaz adaptable a móviles y proyectores. No requiere instalar una app.

## Publicar en Railway desde GitHub

1. Extrae este ZIP en una carpeta. Los archivos `package.json`, `server.js`, `railway.json`, `banco-preguntas.json` y la carpeta `public` deben quedar en la **raíz del proyecto**.
2. Crea un repositorio en GitHub: https://github.com/new
3. En GitHub, abre el repositorio y selecciona **Add file → Upload files**. Sube los archivos y las carpetas de este proyecto **ya extraídos**, no el ZIP sin extraer. Confirma la subida.
4. En https://railway.com/new crea un proyecto y selecciona **Deploy from GitHub repo**. Elige el repositorio.
5. Railway detectará Node.js y arrancará con `npm start`. No necesitas configurar la variable `PORT`: Railway la proporciona.
6. Una vez desplegado, abre tu servicio y ve a **Settings → Networking → Generate Domain**. Esa será la dirección pública de la web.
7. Abre la web en el celular que controlará el juego, pulsa **Crear una partida** y copia el **enlace de presentación** a la persona que tenga la pantalla o proyector. Para controlar desde otro teléfono, usa el enlace privado de control.

La documentación oficial de Railway: https://docs.railway.com/quick-start

## Publicar con Railway CLI (alternativa)

Si ya tienes Node.js y la herramienta `railway` instalados, abre una terminal dentro de esta carpeta y ejecuta:

```sh
railway up
railway domain
```

La CLI puede solicitar inicio de sesión y elegir o crear un proyecto. Consulta: https://docs.railway.com/cli/up

## Prueba local

Con Node.js 20 o posterior:

```sh
npm start
```

Abre http://localhost:3000 y crea una partida. También se puede ejecutar `npm test`.

## Notas importantes

- Las salas se guardan temporalmente en la memoria del servidor y se eliminan tras **6 horas sin actividad**. Se pierden si Railway reinicia o vuelve a desplegar el servicio.
- Mantén **una sola réplica** del servicio en Railway; esta versión no usa una base de datos compartida.
- El enlace de presentación es público y seguro para compartir. El enlace de **control es privado**: quien lo tenga puede marcar respuestas, pausar y reiniciar la ronda.
- Es necesaria una conexión a internet para sincronizar dos dispositivos en distintas redes. Si no hay internet, se recomienda conservar la versión local como respaldo.
- El alojamiento en Railway puede consumir crédito o tener costo según el plan.

## Banco de preguntas editable (nueva función)

La ruta `https://TU-DOMINIO/banco` permite buscar las 1.350 preguntas por letra,
categoría o texto, y descargar un respaldo JSON. El botón **Desbloquear edición**
solicita una contraseña antes de agregar, modificar o eliminar preguntas.

Para instalar esta actualización, reemplaza en el repositorio los archivos
`server.js`, `public/index.html`, `tests/game.test.js` y añade
`question-store.js`, `public/banco.html`, `public/banco.css`, `public/banco.js`.
Mantén `banco-preguntas.json`, `package.json`, `railway.json` y el resto de
archivos. También se puede subir el ZIP completo a un repositorio nuevo.

### Activar edición y persistencia en Railway

1. En el servicio **pasapalabra**, abre **Variables** y agrega:
   - `PASAPALABRA_ADMIN_PASSWORD`: una contraseña robusta que solo conozca el administrador
     (al menos 12 caracteres; mejor 16 o más).
   - `QUESTION_BANK_PATH`: `/data/banco-preguntas.json`
2. En el proyecto, crea un **Volume** nuevo y móntalo en el servicio `pasapalabra`
   exactamente en la ruta `/data`. Esto protege los cambios ante reinicios,
   despliegues y Serverless. **Importante:** Railway puede consumir crédito por
   almacenamiento. Revisa tu plan y consumo antes de aprovisionarlo.
3. Si Railway informa errores de permisos de escritura sobre el volumen,
   agrega `RAILWAY_RUN_UID=0` en Variables y vuelve a desplegar.
4. Abre `/banco`, pulsa **Desbloquear edición** y escribe tu contraseña.

**Seguridad:** La contraseña nunca está incluida en el código ni en el ZIP;
se valida en el servidor. El navegador la conserva solo mientras la página
permanece abierta. No compartas la contraseña ni el enlace del panel de
control del juego con el público. No elimines el volumen después de editar,
porque contiene las modificaciones. Descarga respaldos JSON periódicamente.

Las partidas ya comenzadas conservan sus preguntas originales; las nuevas
preguntas se usarán desde la siguiente sala/partida. Si cambias una pregunta
sin un volumen persistente, los cambios pueden perderse al reiniciar Railway.
