# The Lorena Lopez Foundation · Sitio web

Sitio de [lorenalopezfoundation.org](https://lorenalopezfoundation.org) y de la campaña navideña
**Adopta un Regalo / Sponsor a Child**.

- [Cómo cargar un niño desde el celular](#cómo-cargar-un-niño-desde-el-celular)
- [Cuando llega un regalo](#cuando-llega-un-regalo)
- [Quitar o borrar un perfil](#quitar-o-borrar-un-perfil)
- [Reglas de privacidad](#reglas-de-privacidad)
- [Lista de Deseos de Amazon](#lista-de-deseos-de-amazon)
- [Donaciones con Zeffy](#donaciones-con-zeffy)
- [Cuánto cuesta](#cuánto-cuesta)
- [Si algo falla](#si-algo-falla)
- [Para el equipo técnico](#para-el-equipo-técnico)

---

## Cómo cargar un niño desde el celular

Tiempo aproximado: 5 minutos por niño.

**Antes de empezar, ten a la mano:**
- Las notas del niño (nombre, edad, grado, qué le gusta, qué quiere de regalo).
- Los links de sus regalos, copiados de la Lista de Deseos de Amazon (ver [cómo copiarlos](#copiar-el-link-de-un-regalo)).
- Una foto del niño, solo para crear la caricatura.
- La autorización firmada de su tutor legal.

### 1. Entra al panel

1. Abre **lorenalopezfoundation.org/admin** en el navegador del celular.
2. Escribe tu correo y toca **Send me a code**.
3. Abre el correo que te llega de Cloudflare, copia el código y pégalo.
4. Listo: verás la lista de niños. La sesión dura varias horas; cuando se vence, el panel te pide volver a entrar.

> Tip: en el navegador, usa "Agregar a pantalla de inicio" para tener el panel como una app.

### 2. Agrega al niño

1. Toca **＋ Agregar un niño**.
2. En **Notas sobre el niño**, escribe todo en una sola frase. Ejemplo:
   *"Emilio, 9 años, cuarto grado, le gustan los carros, quiere un carrito de control remoto y un paquete de calcetines"*.
   🔒 Solo el primer nombre. Nada de apellido, escuela, ciudad, orfanato ni su historia.
3. En **Ideas de regalo**, para cada regalo escribe el nombre y pega el link de Amazon.
   Si sale un aviso amarillo, ese link no viene de la Lista de Deseos: cópialo otra vez desde la lista.
4. Toca **Crear perfil**. El sistema le asigna un ID, por ejemplo **NINO-012**.

### 3. Genera el perfil

1. En la sección **2 · Perfil**, toca **✨ Generar perfil con IA**. Tarda unos segundos.
2. Revisa todo: nombre, edad, grado, intereses y los dos textos (español e inglés). Corrige lo que quieras.
3. Si aparece un aviso **🔒 Revisa la privacidad**, borra ese dato de las notas.
4. Toca **Guardar perfil**.
5. La IA también llena los nombres de los regalos en inglés en la sección 1: toca **Guardar notas y regalos**.

¿No te gustó el texto? Toca **Volver a generar** las veces que quieras. Nada se publica hasta el paso 5.

### 4. Crea la caricatura

1. En la sección **3 · Caricatura**, toca **📷 Tomar o elegir foto**.
   Elige una foto donde se le vea bien la cara. La foto se achica en tu teléfono y **no se guarda en ningún lado**.
2. El campo **Fondo del dibujo** ya viene sugerido (por ejemplo "carritos de carreras"). Puedes cambiarlo.
3. Si quieres, en **Indicaciones extra** escribe algo como "con lentes" o "cabello más corto".
4. Toca **🎨 Generar caricatura**. Tarda hasta un minuto; no cierres la página.
5. Si te gusta, toca **✓ Usar esta caricatura**. Si no, toca **Generar otra** (la foto sigue en memoria).
6. Al aprobar, la foto se borra de tu teléfono también.

### 5. Publica

1. En la sección **5 · Publicar**, marca **Tenemos la autorización del tutor legal**.
2. Si falta algo, el panel te dice qué. Cuando todo está listo, toca **Publicar en la página**.
3. El niño aparece en **lorenalopezfoundation.org/navidad** y tiene su propia página para compartir
   (por ejemplo **lorenalopezfoundation.org/ninos/nino-012**).

---

## Cuando llega un regalo

1. Revisa en Amazon qué se compró (ver [Lista de Deseos](#lista-de-deseos-de-amazon): hay que apagar "No arruinar mis sorpresas").
2. En el panel, abre al niño y, en **4 · ¿Ya regalaron algo?**, toca **Marcar regalado**.
3. En la página pública ese regalo aparece tachado como **Ya fue regalado**.

**Exportar la lista completa:** en la pantalla principal del panel toca **⬇︎ Exportar CSV**. Se abre en Excel o
Google Sheets con cada niño, sus regalos y su estado. No incluye las notas internas.

---

## Quitar o borrar un perfil

- **Quitar de la página** (sección 5): el perfil deja de verse pero se conserva. Puedes volver a publicarlo.
- **Quitar la autorización del tutor**: el perfil se quita de la página en ese instante.
- **Borrar este perfil**: borra todo (datos, regalos e imágenes) para siempre. Te pide escribir el ID para confirmar.
  El ID no se vuelve a usar.

---

## Reglas de privacidad

El sistema las aplica, pero el equipo también debe cuidarlas:

| Regla | Cómo se cumple |
|---|---|
| Solo primer nombre | El campo de nombre se recorta a primer nombre; la IA tiene prohibido usar apellidos |
| Sin escuela, ubicación ni historia | La IA no los usa y avisa si aparecen en las notas |
| La foto nunca se guarda | Se achica y limpia en el teléfono, viaja solo para crear el dibujo y no se escribe en el servidor, la base de datos ni el sitio |
| Sin metadatos (EXIF, GPS) | Se quitan de la foto y de todas las imágenes generadas |
| ID interno | Cada niño tiene un ID (NINO-012) que el equipo usa sin datos personales |
| Autorización del tutor | Sin la marca no se puede publicar; quitarla despublica |
| No aparecer en Google | `/navidad` y las páginas de los niños llevan "noindex" |

**Sobre la foto:** para crear la caricatura, la foto se envía un momento a OpenAI. OpenAI no la usa para entrenar,
pero puede conservarla hasta 30 días para revisar abusos. Si se prefiere que la foto no vaya a OpenAI, hay un modo
alternativo (`description`), ver [docs/CONFIGURACION.md](docs/CONFIGURACION.md#caricaturas-modo-y-modelo).

---

## Lista de Deseos de Amazon

Los regalos se compran desde una Lista de Deseos de la fundación en **Amazon.com**. Amazon los envía a la dirección de
la fundación en McAllen y **el donante no ve la dirección completa**: solo el nombre de la lista y la ciudad.

> ⚠️ No escribas la dirección de la fundación en este repositorio ni en el sitio: el repositorio es público.

> Los nombres de los menús de Amazon cambian con el tiempo. Si no encuentras uno exacto, busca algo parecido
> dentro de **Administrar lista** (Manage list).

### Crear la lista (una sola vez, desde una computadora)

1. Entra a **amazon.com** con la cuenta de la fundación.
2. Arriba, pasa el mouse sobre **Account & Lists** y elige **Create a List**.
3. Nombre: **Adopta un Regalo – The Lorena Lopez Foundation**. Toca **Create List**.

### Configurar dirección y privacidad

En la lista, abre el menú **⋯ (More)** → **Manage list** y ajusta:

| Opción | Valor |
|---|---|
| **Privacy** | **Shared** (solo quien tiene el link puede verla; no aparece en búsquedas) |
| **Shipping address** | La dirección de la fundación en McAllen (agrégala antes en *Your Addresses*) |
| **Keep purchased items on your list** | Activado (así los donantes ven qué ya se compró) |
| **Don't spoil my surprises** | **Desactivado** (si no, Amazon esconde a la fundación lo que se compró hasta por varias semanas) |

Toca **Save changes**.

Qué ve el donante: al comprar desde la lista, Amazon le ofrece enviar a la dirección de la lista ("Gift Registry
Address") y le muestra solo el nombre de la lista y la ciudad. Desde marzo de 2026 Amazon comparte la dirección con
los vendedores externos que surten el pedido (como en cualquier envío), pero no con el donante.

### Agregar regalos

1. Busca el artículo en Amazon.
2. En la página del artículo, en **Add to List**, elige **Adopta un Regalo**.
3. En la lista, en el artículo, usa **Needs** (cantidad) y escribe en **Comment** el ID del niño (por ejemplo `NINO-012`),
   para que el equipo sepa para quién es.

### Copiar el link de un regalo

El link tiene que salir **de la lista**, no de la página normal del artículo; así Amazon sabe enviarlo a la fundación.

1. Abre la lista en **amazon.com** desde el navegador (en el celular, no uses la app de Amazon).
2. Toca el **nombre del artículo** dentro de la lista.
3. Copia la dirección de la barra del navegador. Debe contener `colid=` y `coliid=`.
4. Pégala en el panel. Si el panel muestra el aviso amarillo, el link no salió de la lista.

**Haz una prueba antes de lanzar:** abre uno de esos links desde otra cuenta de Amazon, agrégalo al carrito y avanza
hasta elegir dirección. Debe aparecer la dirección de la lista de la fundación como opción. No completes la compra.

### ¿Hay una mejor alternativa?

Para este caso, la Lista de Deseos es la opción más simple: no cuesta nada, el donante compra con su propia cuenta y
la dirección queda oculta. Amazon tuvo un programa para nonprofits ("Charity Lists"), pero venía de AmazonSmile y no
pudimos confirmar que siga activo en 2026. Para quien prefiera no comprar en Amazon, está el botón de patrocinio con Zeffy.

---

## Donaciones con Zeffy

Elegimos **Zeffy** porque no cobra comisiones a nonprofits (el donante puede dejar una propina opcional), acepta
donación **única y mensual**, y envía **recibos deducibles 501(c)(3)** automáticamente.

| | Zeffy | Stripe | PayPal Giving Fund |
|---|---|---|---|
| Comisión | 0% | ≈2.2% + 30¢ (tarifa nonprofit) | 0% |
| Recibo deducible | Automático, a nombre de la fundación | Hay que programarlo | Lo emite PayPal Giving Fund, no la fundación |
| Única y mensual | Sí | Sí (hay que programarlo) | Sí |
| Saber a qué niño va | Pregunta personalizada | Hay que programarlo | No |
| Cuándo llega el dinero | Directo a la cuenta | Directo | Mensual, con retraso |

### Configurar Zeffy (una sola vez)

1. Crea la cuenta en [zeffy.com](https://www.zeffy.com) con el EIN y los datos bancarios de la fundación.
2. Crea un formulario de donación: **Adopta un Regalo / Sponsor a Child**.
3. Activa donación **única** y **mensual**, y los **recibos fiscales automáticos**.
4. Agrega una pregunta personalizada de respuesta corta, opcional:
   **"¿A qué niño quieres patrocinar? Escribe su ID (ej. NINO-012) / Which child? Enter their ID"**.
   En el sitio, junto al botón "Patrocinar", se le dice al donante qué ID escribir.
5. Publica el formulario y copia su link.
6. En el archivo [`_redirects`](_redirects), reemplaza la línea `/donar /#contact 302` por:
   `/donar https://www.zeffy.com/…tu-formulario… 302`.
   Todos los botones **Apoya** y **Patrocinar** del sitio empiezan a llevar a Zeffy.

---

## Cuánto cuesta

### Por cada niño (IA)

Medido en la prueba con la IA real (octubre 2026):

| Concepto | Uso medido | Costo |
|---|---|---|
| Perfil bilingüe (Claude Opus 5.5, US$4/US$20 por millón de tokens) | ≈1,600 tokens de entrada y 360–810 de salida | ≈ US$0.01–0.02 por intento |
| Caricatura (OpenAI gpt-image-2.5-sunburst, calidad media) | ≈1,200 tokens de entrada (foto + texto) y 439 de salida | ≈ US$0.02–0.03 por intento |
| **Por niño, con 1 o 2 intentos de cada cosa** | | **≈ US$0.05 a 0.10** |
| **60 niños** | | **≈ US$3 a 6 en total** |

La tarifa de OpenAI es por tokens (US$5 por millón de texto, US$8 de imagen de entrada y US$30 de imagen de salida, según
publicaciones de octubre 2026); revisa el panel de uso de cada proveedor para ver el gasto real.

### Cada mes

| Servicio | Costo |
|---|---|
| Cloudflare (sitio, base de datos, imágenes, login, correo) | US$0 en el plan gratuito |
| Zeffy | US$0 |
| Lista de Deseos de Amazon | US$0 |
| Dominio (Spaceship) | Lo que ya se paga hoy |

Si en algún momento Cloudflare marca error al generar caricaturas por límite de procesamiento del plan gratuito,
el plan **Workers Paid cuesta US$5 al mes** y lo resuelve. Con 60 niños no se espera que haga falta.

---

## Si algo falla

| Mensaje en el panel | Qué hacer |
|---|---|
| "Tu sesión terminó" | Toca **Volver a entrar** y repite el código del correo |
| "La IA está ocupada" | Espera un minuto e intenta de nuevo |
| "La IA no quiso generar esto" | Prueba con otra foto (de frente, con buena luz) o ajusta las notas |
| "Falta configurar la llave de la IA" | Avísale a Jorge: falta una llave en Cloudflare |
| "Revisa los regalos…" | Cada regalo necesita nombre y un link de Amazon que empiece con `https://` |
| El botón **Publicar** está gris | Lee la lista "Antes de publicar falta…" en la sección 5 |
| No llega el código de Cloudflare | Revisa spam. Solo los correos autorizados pueden entrar |

---

## Para el equipo técnico

- Configuración de Cloudflare, secretos, dominio y correo: [docs/CONFIGURACION.md](docs/CONFIGURACION.md)
- Estructura:
  - `index.html` – sitio principal
  - `navidad/index.html` – plantilla de `/navidad` y `/ninos/…`
  - `admin/` – panel de administración
  - `src/` – Worker (API, login, IA, páginas)
  - `migrations/` – base de datos D1
  - `assets/img/` – imágenes
- Pruebas: `npm test` (unitarias) y `npm run test:e2e` (de punta a punta, con `npm run dev` corriendo).
