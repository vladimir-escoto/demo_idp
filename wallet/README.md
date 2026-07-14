# wallet — Tripleenable Wallet (autenticador soberano, Flutter web)

App demo que hace de **autenticador**: al abrir pide un usuario, genera un par de
llaves **Ed25519** en el dispositivo y registra la **pública** en `global-idp`. Autentica
firmando un reto:

- **QR:** escanea con la cámara el QR de la pantalla de login → firma el `nonce` → `POST /device/approve`.
- **Push:** recibe por **MQTT** (`te/push/<usuario>`) la solicitud → aprueba/rechaza → firma → notifica.

La privada **nunca sale** del dispositivo; el IdP verifica la firma de verdad y redirige al broker.

## Config (compile-time, `--dart-define`)
`IDP_URL` (def. `https://id.idp.tripleenable.com`) · `MQTT_URL` (def. `wss://mqtt.idp.tripleenable.com`).

## Build
```
flutter build web --release
```
El `build/web` compilado se versiona para un deploy rápido con nginx (ver `Dockerfile`).

## Deploy en Coolify
App pública · Dockerfile · Base Directory `/wallet` · puerto `80` · dominio `wallet.idp.tripleenable.com`.
