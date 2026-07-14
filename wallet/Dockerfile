# Sirve el build web ya compilado (build/web) con nginx.
# El build se genera con: flutter build web --release
# (defaults: IDP_URL=https://id.idp.tripleenable.com, MQTT_URL=wss://mqtt.idp.tripleenable.com)
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY build/web /usr/share/nginx/html
EXPOSE 80
