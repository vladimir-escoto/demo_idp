// Tripleenable Wallet — autenticador soberano (demo).
// Al abrir: pide usuario, genera par Ed25519 y registra la PÚBLICA en el IdP.
// Autentica firmando un reto: por QR (cámara) o por push (MQTT). La privada
// nunca sale del dispositivo. El IdP verifica la firma de verdad.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:cryptography/cryptography.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_browser_client.dart';

// Config en runtime: se lee /config.json al abrir, así UN SOLO build sirve a los
// 3 escenarios (Zitadel/Keycloak/Authentik). Fallback a estos defaults (Zitadel).
class Cfg {
  static String idpUrl = 'https://id.idp.tripleenable.com';
  static String mqttUrl = 'wss://broker.emqx.io/mqtt';
  static int mqttPort = 8084;
  static String mqttPrefix = 'tripleenable/idp/push';
  static String broker = ''; // etiqueta visible del broker
  static Color accent = const Color(0xFF5B9DFF);
}

Color get accent => Cfg.accent;
const ok = Color(0xFF34D399);
const bg = Color(0xFF0B1020);
const card = Color(0xFF141C30);
const line = Color(0xFF243049);

Color _hex(dynamic v) {
  var s = '$v'.replaceAll('#', '').trim();
  if (s.length == 6) s = 'FF$s';
  return Color(int.parse(s, radix: 16));
}

Future<void> _loadConfig() async {
  try {
    final r = await http.get(Uri.parse('config.json'));
    if (r.statusCode == 200) {
      final j = jsonDecode(r.body) as Map<String, dynamic>;
      Cfg.idpUrl = (j['idpUrl'] ?? Cfg.idpUrl).toString();
      Cfg.mqttUrl = (j['mqttUrl'] ?? Cfg.mqttUrl).toString();
      Cfg.mqttPort = int.tryParse('${j['mqttPort']}') ?? Cfg.mqttPort;
      Cfg.mqttPrefix = (j['mqttPrefix'] ?? Cfg.mqttPrefix).toString();
      Cfg.broker = (j['broker'] ?? Cfg.broker).toString();
      if (j['accent'] != null) Cfg.accent = _hex(j['accent']);
    }
  } catch (_) {}
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _loadConfig();
  runApp(const WalletApp());
}

class WalletApp extends StatelessWidget {
  const WalletApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Tripleenable Wallet',
        debugShowCheckedModeBanner: false,
        theme: ThemeData.dark(useMaterial3: true).copyWith(
          scaffoldBackgroundColor: bg,
          colorScheme: ColorScheme.dark(primary: accent, surface: card),
        ),
        home: const Gate(),
      );
}

/// Estado del wallet en memoria (se regenera cada vez que se abre la app).
class Wallet {
  final String username;
  final SimpleKeyPair keyPair;
  final String jwkX; // base64url de la pública
  Wallet(this.username, this.keyPair, this.jwkX);

  static final _ed = Ed25519();

  static Future<Wallet> create(String username) async {
    final kp = await _ed.newKeyPair();
    final pub = await kp.extractPublicKey();
    final x = base64Url.encode(pub.bytes).replaceAll('=', '');
    final w = Wallet(username, kp, x);
    await http.post(Uri.parse('${Cfg.idpUrl}/device/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'username': username, 'name': username, 'jwk': {'kty': 'OKP', 'crv': 'Ed25519', 'x': x}}));
    return w;
  }

  Future<String> sign(String nonce) async {
    final sig = await _ed.sign(utf8.encode(nonce), keyPair: keyPair);
    return base64.encode(sig.bytes);
  }
}

/// Puerta de entrada: pide usuario y crea el wallet.
class Gate extends StatefulWidget {
  const Gate({super.key});
  @override
  State<Gate> createState() => _GateState();
}

class _GateState extends State<Gate> {
  final _ctrl = TextEditingController(text: 'ana');
  bool _busy = false;
  String? _err;

  Future<void> _enroll() async {
    final u = _ctrl.text.trim();
    if (u.isEmpty) return;
    setState(() { _busy = true; _err = null; });
    try {
      final w = await Wallet.create(u);
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => Home(wallet: w)));
    } catch (e) {
      setState(() { _err = 'No se pudo registrar: $e'; _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const _Logo(),
                const SizedBox(height: 22),
                const Text('Tu identidad, en tu dispositivo', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                const Text('Elige un nombre de usuario. Generamos un par de llaves Ed25519 en este dispositivo y registramos la pública en Tripleenable ID. La privada nunca sale de aquí.',
                    style: TextStyle(color: Color(0xFF93A1BD), height: 1.5)),
                const SizedBox(height: 20),
                TextField(controller: _ctrl, decoration: _dec('nombre de usuario')),
                const SizedBox(height: 12),
                FilledButton(onPressed: _busy ? null : _enroll,
                    style: FilledButton.styleFrom(backgroundColor: accent, foregroundColor: bg, padding: const EdgeInsets.symmetric(vertical: 15)),
                    child: Text(_busy ? 'Creando…' : 'Crear wallet y registrar', style: const TextStyle(fontWeight: FontWeight.w800))),
                if (_err != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_err!, style: const TextStyle(color: Color(0xFFF87171)))),
              ]),
            ),
          ),
        ),
      );
}

class Home extends StatefulWidget {
  final Wallet wallet;
  const Home({super.key, required this.wallet});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  late MqttBrowserClient _mqtt;
  String _mqttState = 'conectando…';
  final List<Map<String, dynamic>> _pushes = [];

  @override
  void initState() {
    super.initState();
    _connectMqtt();
  }

  Future<void> _connectMqtt() async {
    _mqtt = MqttBrowserClient(Cfg.mqttUrl, 'wallet-${widget.wallet.username}-${DateTime.now().millisecondsSinceEpoch}');
    _mqtt.port = Cfg.mqttPort;
    _mqtt.logging(on: false);
    _mqtt.keepAlivePeriod = 30;
    _mqtt.onConnected = () => setState(() => _mqttState = 'push activo');
    _mqtt.onDisconnected = () => setState(() => _mqttState = 'desconectado');
    try {
      await _mqtt.connect();
      _mqtt.subscribe('${Cfg.mqttPrefix}/${widget.wallet.username}', MqttQos.atMostOnce);
      _mqtt.updates!.listen((events) {
        final rec = events[0].payload as MqttPublishMessage;
        final msg = MqttPublishPayload.bytesToStringAsString(rec.payload.message);
        try {
          final data = jsonDecode(msg) as Map<String, dynamic>;
          setState(() => _pushes.insert(0, data));
        } catch (_) {}
      });
    } catch (e) {
      setState(() => _mqttState = 'sin MQTT');
    }
  }

  Future<void> _respond(Map<String, dynamic> req, bool approve) async {
    final idp = (req['idp'] ?? Cfg.idpUrl).toString();
    final body = <String, dynamic>{'username': widget.wallet.username, 'uid': req['uid']};
    if (approve) {
      body['signature'] = await widget.wallet.sign(req['nonce'].toString());
    } else {
      body['decision'] = 'deny';
    }
    await http.post(Uri.parse('$idp/device/approve'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(body));
    if (mounted) {
      setState(() => _pushes.remove(req));
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(approve ? 'Firmado y aprobado ✓' : 'Rechazado'), backgroundColor: approve ? ok : const Color(0xFF334155)));
    }
  }

  Future<void> _scan() async {
    final result = await Navigator.of(context).push<Map<String, dynamic>>(MaterialPageRoute(builder: (_) => const ScanPage()));
    if (result == null) return;
    if (!mounted) return;
    final approve = await _confirmDialog(result);
    if (approve == null) return;
    await _respond(result, approve);
  }

  Future<bool?> _confirmDialog(Map<String, dynamic> req) => showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          backgroundColor: card,
          title: const Text('Solicitud de acceso'),
          content: Text('${req['client']} quiere iniciar tu sesión como "${widget.wallet.username}".\nFirmarás el reto con tu llave.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Rechazar', style: TextStyle(color: Color(0xFFF87171)))),
            FilledButton(onPressed: () => Navigator.pop(context, true), style: FilledButton.styleFrom(backgroundColor: ok, foregroundColor: bg), child: const Text('Aprobar y firmar')),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final w = widget.wallet;
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: ListView(padding: const EdgeInsets.all(22), children: [
            const _Logo(),
            const SizedBox(height: 18),
            Container(
              decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(18), border: Border.all(color: line)),
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  CircleAvatar(radius: 22, backgroundColor: accent, child: Text(w.username.isNotEmpty ? w.username[0].toUpperCase() : '?', style: const TextStyle(color: bg, fontWeight: FontWeight.w900))),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(w.username, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    Text('Ed25519 · registrado en Tripleenable ID', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
                  ])),
                  _Badge(_mqttState, _mqttState == 'push activo' ? ok : Colors.grey),
                ]),
                const SizedBox(height: 12),
                Text('pk: ${w.jwkX}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.grey.shade500, fontSize: 11, fontFamily: 'monospace')),
              ]),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(onPressed: _scan,
                style: FilledButton.styleFrom(backgroundColor: accent, foregroundColor: bg, padding: const EdgeInsets.symmetric(vertical: 15)),
                icon: const Icon(Icons.qr_code_scanner), label: const Text('Escanear QR para entrar', style: TextStyle(fontWeight: FontWeight.w800))),
            const SizedBox(height: 22),
            Text('SOLICITUDES PUSH', style: TextStyle(color: Colors.grey.shade500, fontSize: 12, letterSpacing: .5)),
            const SizedBox(height: 8),
            if (_pushes.isEmpty)
              Container(padding: const EdgeInsets.all(18), decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(14), border: Border.all(color: line)),
                  child: Text('Sin solicitudes. En la pantalla de login del IdP, envía un push a "${w.username}".', style: TextStyle(color: Colors.grey.shade400))),
            ..._pushes.map((r) => Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(14), border: Border.all(color: line)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${r['client']} quiere iniciar tu sesión', style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text('como ${w.username}', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
                    const SizedBox(height: 10),
                    Row(children: [
                      Expanded(child: FilledButton(onPressed: () => _respond(r, true), style: FilledButton.styleFrom(backgroundColor: ok, foregroundColor: bg), child: const Text('Aprobar'))),
                      const SizedBox(width: 10),
                      Expanded(child: OutlinedButton(onPressed: () => _respond(r, false), style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFF87171)), child: const Text('Rechazar'))),
                    ]),
                  ]),
                )),
          ]),
        ),
      ),
    );
  }
}

class ScanPage extends StatelessWidget {
  const ScanPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Escanea el QR del login'), backgroundColor: bg),
        body: MobileScanner(onDetect: (capture) {
          for (final b in capture.barcodes) {
            final raw = b.rawValue;
            if (raw == null) continue;
            try {
              final data = jsonDecode(raw) as Map<String, dynamic>;
              if (data['uid'] != null && data['nonce'] != null) {
                Navigator.of(context).pop(data);
                return;
              }
            } catch (_) {}
          }
        }),
      );
}

class _Logo extends StatelessWidget {
  const _Logo();
  @override
  Widget build(BuildContext context) => Row(children: [
        Container(width: 38, height: 38, decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), gradient: LinearGradient(colors: [accent, ok])),
            child: const Center(child: Text('T', style: TextStyle(color: bg, fontWeight: FontWeight.w900, fontSize: 20)))),
        const SizedBox(width: 10),
        const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Tripleenable Wallet', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          Text('autenticador soberano', style: TextStyle(color: Color(0xFF93A1BD), fontSize: 11)),
        ]),
        if (Cfg.broker.isNotEmpty) ...[
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(999)),
            child: Text('via ${Cfg.broker}', style: const TextStyle(color: bg, fontWeight: FontWeight.w800, fontSize: 11)),
          ),
        ],
      ]);
}

class _Badge extends StatelessWidget {
  final String text; final Color color;
  const _Badge(this.text, this.color);
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: color.withValues(alpha: .12), borderRadius: BorderRadius.circular(999), border: Border.all(color: color.withValues(alpha: .4))),
        child: Text(text, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700)),
      );
}

InputDecoration _dec(String hint) => InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: const Color(0xFF0E1626),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(11), borderSide: const BorderSide(color: line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(11), borderSide: const BorderSide(color: line)),
    );
