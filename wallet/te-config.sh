#!/bin/sh
# Genera /config.json que el wallet Flutter lee en runtime.
# Cada despliegue (Zitadel/Keycloak/Authentik) pone sus propias variables de entorno.
cat > /usr/share/nginx/html/config.json <<EOF
{
  "idpUrl": "${IDP_URL:-https://id.idp.tripleenable.com}",
  "mqttUrl": "${MQTT_URL:-wss://broker.emqx.io/mqtt}",
  "mqttPort": ${MQTT_PORT:-8084},
  "mqttPrefix": "${MQTT_TOPIC_PREFIX:-tripleenable/idp/push}",
  "broker": "${BROKER_LABEL:-}",
  "accent": "${ACCENT:-#5b9dff}"
}
EOF
echo "[te-config] config.json -> idp=${IDP_URL:-default} broker=${BROKER_LABEL:-none} topic=${MQTT_TOPIC_PREFIX:-default}"
