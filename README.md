# Pasapalabra en comunidad — versión web

Juego para una actividad grupal: adultos mayores en una fundación. Mezcla preguntas de cultura general y convivencia con algunos conceptos de participación ciudadana, respeto, comunidad y pobreza. No pide a las personas compartir experiencias personales.

## Incluye

- Rosco de 27 letras (con Ñ), con **135 preguntas**: cinco por letra.
- Ocho preguntas sociales y 19 recreativas por ronda, elegidas automáticamente, con al menos una sobre pobreza.
- Nueva ronda con preguntas distintas de la anterior (en la misma letra).
- Temporizador de 3, 5, 8, 10 o 15 minutos.
- Verde/rojo en el centro por **0,7 segundos**, con colores permanentes en las letras.
- Opción de pasar palabra, mostrar/ocultar pregunta y ofrecer una pista adicional.
- Una pantalla pública sin controles ni respuestas y una pantalla privada de control.
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
