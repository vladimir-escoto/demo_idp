# Tripleenable — Demo IdP Suite

Banco de pruebas **de 0 a 100** para evaluar cómo montar la identidad de Tripleenable:
un **IdP global passwordless** (QR/push) + varios **brokers IAM** multi-tenant
(Zitadel, Keycloak, Authentik) + **clientes web reales** + un **panel de administración
de tenant**. Todo se despliega en Coolify (build por Dockerfile desde este repo público).

```
                      ┌───────────────────────────────────────────────┐
   Usuario global ───▶│  global-idp  (Tripleenable ID · QR / push)     │  ← passwordless
                      │  login.idp.tripleenable.com                    │
                      └───────────────▲───────────────────────────────┘
                                      │ OIDC (federación / brokering)
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
 ┌──────┴───────┐            ┌────────┴────────┐          ┌─────────┴────────┐
 │  Zitadel     │            │  Keycloak       │          │  Authentik       │  brokers
 │  (orgs)      │            │  (realms)       │          │  (brands)        │  multi-tenant
 └──────▲───────┘            └────────▲────────┘          └─────────▲────────┘
        │ OIDC                        │ OIDC                        │ OIDC
 ┌──────┴───────┐            ┌────────┴────────┐          ┌─────────┴────────┐
 │ web-client   │            │ web-client      │          │ web-client       │  storefronts
 │ (Care Store) │            │ (otro tenant)   │          │ (otro tenant)    │  (RP OIDC)
 └──────────────┘            └─────────────────┘          └──────────────────┘

 tenant-admin  ── APIs ──▶  Zitadel / Keycloak   (registrar apps, ver usuarios: self-service)
```

## Subproyectos

| Carpeta | Qué es | Puerto | Deploy en Coolify |
|---|---|---|---|
| [`global-idp/`](global-idp) | IdP OIDC passwordless (QR + push). Login desde el "móvil". | 3000 | App pública · Dockerfile · base `/global-idp` |
| [`web-client/`](web-client) | Storefront/RP OIDC. Branded, parametrizado por env. | 3000 | App pública · Dockerfile · base `/web-client` |
| [`tenant-admin/`](tenant-admin) | Panel del dueño/dev del tenant. Usa APIs de Zitadel y Keycloak. | 3000 | App pública · Dockerfile · base `/tenant-admin` |

Los brokers (**Zitadel**, **Keycloak**, **Authentik**) son imágenes oficiales; se despliegan
como servicios en Coolify. Ver [`brokers/`](brokers) para sus composes de referencia.

## Modelo mental (importante)

- **Tripleenable es dueño de la plataforma.** El diferenciador es el **login soberano**
  (aquí simulado con QR/push en `global-idp`). Los brokers son el **puente corporativo**
  (SAML/OIDC/SCIM, multi-tenant) — no el diferenciador.
- **Cada empresa cliente = un tenant** (Organization en Zitadel, Realm en Keycloak, Brand
  en Authentik). El dueño del tenant administra **solo lo suyo** (rol acotado) y **no puede
  quitar** el IdP global — eso lo fija Tripleenable a nivel de instancia.
- **Los usuarios finales son globales**: viven en `global-idp` y entran a cualquier tenant
  con la misma identidad; cada tenant los ve de forma **aislada**.

## Deploy (patrón general en Coolify)

1. **+ New → Application → Public Repository** → `https://github.com/vladimir-escoto/demo_idp`.
2. Build Pack: **Dockerfile**. Base Directory: `/<subproyecto>`.
3. Puerto expuesto: `3000`. Dominio: `<algo>.idp.tripleenable.com`.
4. Variables de entorno según el `README.md` del subproyecto.
