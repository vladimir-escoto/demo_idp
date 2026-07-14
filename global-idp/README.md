# global-idp — Tripleenable ID (OIDC passwordless · QR/push)

OpenID Provider real (`node-oidc-provider`) al que los brokers federan. En vez de
usuario/contraseña, el login se **aprueba desde un autenticador** (simula el móvil):
el navegador muestra un **QR** y espera; el autenticador ve la solicitud (**push**) y la
aprueba. Passwordless de punta a punta.

## Flujo
1. El broker manda al usuario a `/(.well-known)/auth` (OIDC authorize).
2. El IdP muestra `/interaction/:uid` con un **QR** y "Esperando aprobación…".
3. El usuario abre el **autenticador** (`/authenticator`, o escaneando el QR), elige su
   identidad enrolada y **aprueba** (push).
4. El navegador detecta la aprobación (polling) y completa el login → vuelve al broker con el `code`.

## Endpoints propios
`/interaction/:uid` · `/interaction/:uid/status` · `/interaction/:uid/finish` ·
`/authenticator` · `/authenticator/pending|approve|deny|enroll`. El resto es OIDC estándar
(`/.well-known/openid-configuration`, `/auth`, `/token`, `/me`, `/jwks`, `/session/end`).

## Env
| Variable | Default | Qué es |
|---|---|---|
| `OIDC_ISSUER` | `https://id.idp.tripleenable.com` | Issuer público |
| `PORT` | `3000` | Puerto |
| `COOKIE_KEY` | *(aleatorio)* | Clave de cookies (fíjala para sesiones estables) |
| `CLIENT_SECRET_ZITADEL` | *(demo)* | Secret del cliente `zitadel` |
| `CLIENT_SECRET_KEYCLOAK` | *(demo)* | Secret del cliente `keycloak` |
| `CLIENT_SECRET_AUTHENTIK` | *(demo)* | Secret del cliente `authentik` |
| `REDIRECT_ZITADEL` / `REDIRECT_KEYCLOAK` / `REDIRECT_AUTHENTIK` | *(callbacks conocidos)* | Redirect URIs (coma-separadas) por broker |

Usuarios demo: `ana`, `bruno`, `carla` (globales).

## Deploy en Coolify
App pública · Dockerfile · Base Directory `/global-idp` · puerto `3000` · dominio
`id.idp.tripleenable.com`. Registra este IdP como **OIDC upstream** en cada broker con el
`client_id` (`zitadel`/`keycloak`/`authentik`) y su secret.
