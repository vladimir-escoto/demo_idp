# Theme de login Keycloak — `tripleenable`

Branding Tripleenable para el login de Keycloak 26 (`login/theme.properties` + `resources/css/tripleenable.css`, extiende el theme base con wordmark + colores).

## Aplicarlo (2 pasos)

**1) Meter el theme en el contenedor Keycloak.** Dos opciones:

- **Imagen custom** (recomendado): cambia la imagen del servicio Keycloak en Coolify a una que hornee el theme:
  ```dockerfile
  FROM quay.io/keycloak/keycloak:26.1
  COPY keycloak/themes/tripleenable /opt/keycloak/themes/tripleenable
  ```
- **Volumen**: en el servicio Keycloak de Coolify → Persistent Storage, monta esta carpeta en
  `/opt/keycloak/themes/tripleenable` y redeploy.

**2) Activar el theme en el realm** `care` (una vez el theme está en el contenedor). Añádelo al final de
`keycloak/setup-care-realm.sh` o córrelo aparte dentro del contenedor:
```bash
/opt/keycloak/bin/kcadm.sh update realms/care -s loginTheme=tripleenable
```

> No actives `loginTheme=tripleenable` antes de que el theme exista en el contenedor, o el login del realm quedaría sin estilos.
