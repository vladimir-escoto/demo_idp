# Sirve el build web ya compilado (build/web) con nginx.
# El build se genera con: flutter build web --release
# La config del escenario (IdP URL, topic MQTT, color, broker) se inyecta en RUNTIME
# vía /config.json generado desde variables de entorno (ver te-config.sh).
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY build/web /usr/share/nginx/html
# nginx:alpine ejecuta los *.sh de /docker-entrypoint.d/ antes de arrancar nginx
COPY te-config.sh /docker-entrypoint.d/40-te-config.sh
RUN chmod +x /docker-entrypoint.d/40-te-config.sh
EXPOSE 80
