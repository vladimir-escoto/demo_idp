#!/usr/bin/env bash
# Configura el realm `care` en Keycloak para el escenario Tripleenable.
# Se ejecuta DENTRO del contenedor Keycloak (tiene kcadm.sh + el env con el admin).
# La password admin se toma de $KC_BOOTSTRAP_ADMIN_PASSWORD (nunca se imprime).
#   Uso: curl -sL <raw>/keycloak/setup-care-realm.sh | docker exec -i <kc-container> bash
set -e
KcAdm=/opt/keycloak/bin/kcadm.sh
KC_ID_ISSUER="https://kc-id.idp.tripleenable.com"
IDP_SECRET="keycloak-tripleenable-idp-secret"
CARE_STORE_SECRET="care-store-kc-secret"
CARE_STORE_URL="https://kc-care-store.idp.tripleenable.com"

echo ">> login admin (master)"
$KcAdm config credentials --server http://localhost:8080 --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"

echo ">> crear realm care (si no existe)"
$KcAdm create realms -s realm=care -s enabled=true -s displayName="Care (Keycloak tenant)" 2>/dev/null || echo "   realm ya existe"

echo ">> crear IdP OIDC 'tripleenable' -> $KC_ID_ISSUER"
$KcAdm create identity-provider/instances -r care \
  -s alias=tripleenable \
  -s displayName="Tripleenable ID" \
  -s providerId=oidc \
  -s enabled=true \
  -s trustEmail=true \
  -s storeToken=false \
  -s linkOnly=false \
  -s 'config.clientId=keycloak' \
  -s "config.clientSecret=$IDP_SECRET" \
  -s 'config.clientAuthMethod=client_secret_basic' \
  -s "config.authorizationUrl=$KC_ID_ISSUER/auth" \
  -s "config.tokenUrl=$KC_ID_ISSUER/token" \
  -s "config.userInfoUrl=$KC_ID_ISSUER/me" \
  -s "config.jwksUrl=$KC_ID_ISSUER/jwks" \
  -s "config.issuer=$KC_ID_ISSUER" \
  -s 'config.useJwksUrl=true' \
  -s 'config.validateSignature=true' \
  -s 'config.defaultScope=openid profile email' \
  -s 'config.syncMode=FORCE' \
  2>/dev/null || echo "   IdP ya existe"

echo ">> mappers de claims (firstName/lastName/email/username)"
mk_mapper () {  # nombre claim atributo
  $KcAdm create identity-provider/instances/tripleenable/mappers -r care \
    -s name="$1" -s identityProviderAlias=tripleenable \
    -s identityProviderMapper=oidc-user-attribute-idp-mapper \
    -s "config.syncMode=INHERIT" -s "config.claim=$2" -s "config.user.attribute=$3" \
    2>/dev/null || echo "   mapper $1 ya existe"
}
mk_mapper firstName given_name firstName
mk_mapper lastName  family_name lastName
mk_mapper email     email       email
mk_mapper username  preferred_username username

echo ">> crear client 'care-store' (confidencial) -> $CARE_STORE_URL"
$KcAdm create clients -r care \
  -s clientId=care-store \
  -s name="Care Store" \
  -s enabled=true \
  -s protocol=openid-connect \
  -s publicClient=false \
  -s secret="$CARE_STORE_SECRET" \
  -s standardFlowEnabled=true \
  -s directAccessGrantsEnabled=false \
  -s "redirectUris=[\"$CARE_STORE_URL/callback\"]" \
  -s "webOrigins=[\"$CARE_STORE_URL\"]" \
  2>/dev/null || echo "   client ya existe"

echo ">> crear client 'tenant-admin' (panel de administración) en master"
$KcAdm create clients -r master \
  -s clientId=tenant-admin -s name="Tenant Admin (panel)" -s enabled=true \
  -s protocol=openid-connect -s publicClient=false -s secret=tenant-admin-kc-secret \
  -s standardFlowEnabled=true -s directAccessGrantsEnabled=false \
  -s 'redirectUris=["https://admin-keycloak.idp.tripleenable.com/callback"]' \
  -s 'webOrigins=["https://admin-keycloak.idp.tripleenable.com"]' \
  2>/dev/null || echo "   client tenant-admin (master) ya existe"

echo ">> OK. realm 'care' (IdP=tripleenable, client=care-store) + client 'tenant-admin' en master."
echo "   Panel Keycloak: entra en https://admin-keycloak.idp.tripleenable.com con tu admin de master."
