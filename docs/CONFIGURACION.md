# Configuración técnica (Cloudflare)

Guía para poner en línea el sitio en Cloudflare la primera vez. Solo se hace una vez.
El README principal explica el uso diario del panel.

> Los nombres de los menús de Cloudflare cambian con el tiempo; si no encuentras uno exacto,
> busca la palabra clave (por ejemplo "Access" o "D1") en el buscador del panel.

## 0. Requisitos

- Cuenta gratuita en [Cloudflare](https://dash.cloudflare.com/sign-up).
- Node.js 20 o más reciente en la computadora donde se configura.
- En la carpeta del proyecto: `npm install` y luego `npx wrangler login`.

## 1. Base de datos y almacenamiento de imágenes

```bash
npx wrangler d1 create llf-ninos
```

Copia el `database_id` que aparece y pégalo en `wrangler.jsonc` en lugar de `REEMPLAZAR-CON-EL-ID-DE-D1`.

```bash
npx wrangler d1 migrations apply llf-ninos --remote
npx wrangler r2 bucket create llf-caricaturas
```

## 2. Llaves y datos privados (secretos)

Cada comando pide el valor; no queda guardado en el repositorio.

| Secreto | Qué es |
|---|---|
| `ANTHROPIC_API_KEY` | Llave de [Claude](https://console.anthropic.com/) para los perfiles |
| `OPENAI_API_KEY` | Llave de [OpenAI](https://platform.openai.com/) para las caricaturas |
| `CONTACT_TO` | Buzón que recibe el formulario de contacto (debe estar verificado en Email Routing, paso 5) |
| `ADMIN_EMAILS` | Correos de los administradores separados por coma |
| `ACCESS_TEAM_DOMAIN` | Dominio de equipo de Access, p. ej. `https://lorenalopez.cloudflareaccess.com` (paso 4) |
| `ACCESS_AUD` | "Application Audience (AUD) Tag" de la aplicación de Access (paso 4) |

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
# ...y así con cada uno
```

## 3. Publicar el Worker y conectar GitHub

```bash
npm run deploy
```

Para que cada cambio en GitHub se publique solo: en el panel de Cloudflare, **Workers & Pages →
lorena-lopez-foundation → Settings → Builds → Connect** y elige el repositorio. Cada Pull Request
recibe una URL de vista previa.

## 4. Login de administradores (Cloudflare Access)

1. **Zero Trust** (gratis hasta 50 usuarios). La primera vez pide elegir un nombre de equipo:
   ese es el `ACCESS_TEAM_DOMAIN`.
2. **Access → Applications → Add an application → Self-hosted**.
3. Nombre: `Panel Adopta un Regalo`. Agrega dos destinos con el dominio
   `lorenalopezfoundation.org`: ruta `admin` y ruta `api/admin`.
4. Política: **Allow**, regla **Include → Emails** con los correos de Jorge y Lorena.
5. Método de login: **One-time PIN** (llega un código al correo; no hay contraseñas).
6. Guarda y copia el **Application Audience (AUD) Tag** al secreto `ACCESS_AUD`.

El Worker revisa otra vez la firma de Access y que el correo esté en `ADMIN_EMAILS`.
Si falta cualquiera de los tres secretos de Access, nadie puede entrar al panel.

## 5. Dominio y correo

El dominio sigue registrado en Spaceship; solo se cambia quién maneja el DNS.

1. En Cloudflare: **Add a domain → lorenalopezfoundation.org** (plan Free). Cloudflare copia
   los registros DNS actuales; revisa que estén los MX de correo.
2. Antes de cambiar nada, anota a qué correo reenvía hoy `info@` en Spaceship.
3. En Spaceship cambia los nameservers por los dos que indica Cloudflare.
4. Cuando el dominio aparezca como activo: **Email → Email Routing**, activa el servicio y crea
   la regla `info@lorenalopezfoundation.org` → el buzón real. Verifica ese buzón (llega un correo).
   Ese mismo buzón va en el secreto `CONTACT_TO`.
5. En **Workers & Pages → lorena-lopez-foundation → Settings → Domains & Routes** agrega
   `lorenalopezfoundation.org` y `www.lorenalopezfoundation.org` como Custom Domains.
6. En GitHub, **Settings → Pages**, desactiva GitHub Pages cuando el sitio ya cargue desde Cloudflare.

## Desarrollo local

```bash
npm install
cp .dev.vars.example .dev.vars    # admin de prueba y modo IA simulado
npm run db:migrate:local
npm run dev                       # http://localhost:8787
npm test                          # pruebas unitarias
npm run test:e2e                  # punta a punta: con npm run dev corriendo y AI_MOCK=1 (si no, gasta en la IA real)
```

Con `AI_MOCK=1` no se llama a Claude ni a OpenAI. `DEV_ADMIN_EMAIL` y `AI_MOCK` solo funcionan
en `localhost`.

## Caricaturas: modo y modelo

En `wrangler.jsonc`, `vars`:

- `IMAGE_MODE`: `description` (el que está puesto: Claude describe rasgos generales y OpenAI dibuja solo con
  texto; la foto no va a OpenAI) o `photo` (la foto va como referencia a OpenAI; se parece más, pero una
  caricatura parecida no garantiza anonimato).
- `IMAGE_MODEL`: `gpt-image-2.5-sunburst` (recomendado para ediciones) o `gpt-image-2.5-flare`.
- `IMAGE_QUALITY`: `medium` (≈ US$0.02–0.03 por imagen, medido) o `high`.

En ningún modo se guarda la foto: vive solo en memoria durante la petición.
