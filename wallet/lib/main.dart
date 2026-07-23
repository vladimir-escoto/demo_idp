// Tripleenable Wallet — autenticador soberano (demo).
// Guarda VARIAS identidades Ed25519 en este dispositivo (localStorage). Autentica
// firmando un reto por QR (cámara) o push (MQTT). La privada nunca sale de aquí;
// el IdP verifica la firma de verdad. Al firmar, tú eliges con qué identidad.
import 'dart:convert';
import 'dart:html' as html;
import 'package:flutter/material.dart';
import 'package:cryptography/cryptography.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_browser_client.dart';

// Config en runtime: se lee /config.json al abrir, así UN SOLO build sirve a
// todos los escenarios (Zitadel/Keycloak/Authentik/Logto).
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
  final ids = await Vault.loadAll();
  runApp(WalletApp(identities: ids));
}

class WalletApp extends StatelessWidget {
  final List<Identity> identities;
  const WalletApp({super.key, required this.identities});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Tripleenable Wallet',
        debugShowCheckedModeBanner: false,
        theme: ThemeData.dark(useMaterial3: true).copyWith(
          scaffoldBackgroundColor: bg,
          colorScheme: ColorScheme.dark(primary: accent, surface: card),
        ),
        home: identities.isNotEmpty ? Home(identities: identities) : const Gate(),
      );
}

/// Una identidad soberana: par Ed25519 + username. La privada nunca sale de aquí.
class Identity {
  final String username;
  final SimpleKeyPair keyPair;
  final String jwkX; // base64url de la pública
  Identity(this.username, this.keyPair, this.jwkX);

  static final _ed = Ed25519();

  static Future<String> _x(SimpleKeyPair kp) async =>
      base64Url.encode((await kp.extractPublicKey()).bytes).replaceAll('=', '');

  /// Registra (idempotente) la pública en el IdP.
  Future<void> register() async {
    await http.post(Uri.parse('${Cfg.idpUrl}/device/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'username': username, 'name': username, 'jwk': {'kty': 'OKP', 'crv': 'Ed25519', 'x': jwkX}}));
  }

  Future<String> sign(String nonce) async {
    final sig = await _ed.sign(utf8.encode(nonce), keyPair: keyPair);
    return base64.encode(sig.bytes);
  }

  static Future<Identity> generate(String username) async {
    final kp = await _ed.newKeyPair();
    return Identity(username, kp, await _x(kp));
  }

  static Future<Identity> fromSeed(String username, List<int> seed) async {
    final kp = await _ed.newKeyPairFromSeed(seed);
    return Identity(username, kp, await _x(kp));
  }

  Future<List<int>> seed() => keyPair.extractPrivateKeyBytes();
}

/// Bóveda de identidades persistida en el dispositivo (localStorage).
class Vault {
  static const _k = 'te_wallet_ids'; // JSON [{u, s(seed b64)}]
  // Claves del formato viejo (una sola identidad) — migración transparente.
  static const _kUserOld = 'te_wallet_username';
  static const _kSeedOld = 'te_wallet_seed';

  static List<Map<String, String>> _raw() {
    final s = html.window.localStorage[_k];
    if (s != null) {
      try {
        return (jsonDecode(s) as List).map((e) => {'u': '${e['u']}', 's': '${e['s']}'}).toList();
      } catch (_) {}
    }
    // Migrar del formato antiguo si existe.
    final ou = html.window.localStorage[_kUserOld];
    final os = html.window.localStorage[_kSeedOld];
    if (ou != null && os != null) {
      html.window.localStorage.remove(_kUserOld);
      html.window.localStorage.remove(_kSeedOld);
      final list = [{'u': ou, 's': os}];
      _write(list);
      return list;
    }
    return [];
  }

  static void _write(List<Map<String, String>> list) =>
      html.window.localStorage[_k] = jsonEncode(list);

  /// Carga todas las identidades guardadas y las re-registra en el IdP.
  static Future<List<Identity>> loadAll() async {
    final out = <Identity>[];
    for (final e in _raw()) {
      try {
        final id = await Identity.fromSeed(e['u']!, base64.decode(e['s']!));
        await id.register(); // re-registra por si el IdP se reinició
        out.add(id);
      } catch (_) {}
    }
    return out;
  }

  /// Crea una identidad nueva (o devuelve la existente), la persiste y registra.
  static Future<Identity> add(String username) async {
    final list = _raw();
    final existing = list.where((e) => e['u'] == username).toList();
    final Identity id = existing.isNotEmpty
        ? await Identity.fromSeed(username, base64.decode(existing.first['s']!))
        : await Identity.generate(username);
    if (existing.isEmpty) {
      list.add({'u': username, 's': base64.encode(await id.seed())});
      _write(list);
    }
    await id.register();
    return id;
  }

  static void remove(String username) =>
      _write(_raw().where((e) => e['u'] != username).toList());
}

/// Puerta de entrada: enrola una nueva identidad.
class Gate extends StatefulWidget {
  const Gate({super.key});
  @override
  State<Gate> createState() => _GateState();
}

class _GateState extends State<Gate> {
  final _ctrl = TextEditingController();
  bool _busy = false;
  String? _err;

  Future<void> _enroll() async {
    final u = _ctrl.text.trim();
    if (u.isEmpty) return;
    setState(() { _busy = true; _err = null; });
    try {
      final id = await Vault.add(u);
      if (!mounted) return;
      // Si venimos de "añadir identidad" (hay Home debajo), volvemos con la nueva;
      // si es el arranque en frío, entramos al Home con esta identidad.
      if (Navigator.of(context).canPop()) {
        Navigator.of(context).pop(id);
      } else {
        Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => Home(identities: [id])));
      }
    } catch (e) {
      setState(() { _err = 'No se pudo registrar: $e'; _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final canCancel = Navigator.of(context).canPop();
    return Scaffold(
      appBar: canCancel ? AppBar(backgroundColor: bg, title: const Text('Añadir identidad')) : null,
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
              TextField(controller: _ctrl, autofocus: true, decoration: _dec('nombre de usuario'), onSubmitted: (_) => _busy ? null : _enroll()),
              const SizedBox(height: 12),
              FilledButton(onPressed: _busy ? null : _enroll,
                  style: FilledButton.styleFrom(backgroundColor: accent, foregroundColor: bg, padding: const EdgeInsets.symmetric(vertical: 15)),
                  child: Text(_busy ? 'Creando…' : 'Crear identidad y registrar', style: const TextStyle(fontWeight: FontWeight.w800))),
              if (_err != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_err!, style: const TextStyle(color: Color(0xFFF87171)))),
            ]),
          ),
        ),
      ),
    );
  }
}

class Home extends StatefulWidget {
  final List<Identity> identities;
  const Home({super.key, required this.identities});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  late final List<Identity> _ids = [...widget.identities];
  MqttBrowserClient? _mqtt;
  String _mqttState = 'conectando…';
  final List<Map<String, dynamic>> _pushes = []; // cada push lleva '_forUser'

  String _topic(String u) => '${Cfg.mqttPrefix}/$u';

  @override
  void initState() {
    super.initState();
    _connectMqtt();
  }

  Future<void> _connectMqtt() async {
    final c = MqttBrowserClient(Cfg.mqttUrl, 'wallet-${DateTime.now().millisecondsSinceEpoch}');
    c.port = Cfg.mqttPort;
    c.logging(on: false);
    c.keepAlivePeriod = 30;
    c.onConnected = () {
      for (final id in _ids) c.subscribe(_topic(id.username), MqttQos.atMostOnce);
      setState(() => _mqttState = 'push activo');
    };
    c.onDisconnected = () => setState(() => _mqttState = 'desconectado');
    _mqtt = c;
    try {
      await c.connect();
      c.updates!.listen((events) {
        final rec = events[0].payload as MqttPublishMessage;
        final topic = events[0].topic;
        final forUser = topic.split('/').last; // prefix/<username>
        final msg = MqttPublishPayload.bytesToStringAsString(rec.payload.message);
        try {
          final data = jsonDecode(msg) as Map<String, dynamic>;
          data['_forUser'] = forUser;
          setState(() => _pushes.insert(0, data));
        } catch (_) {}
      });
    } catch (e) {
      setState(() => _mqttState = 'sin MQTT');
    }
  }

  Identity? _byUser(String? u) {
    for (final id in _ids) {
      if (id.username == u) return id;
    }
    return null;
  }

  Future<void> _respond(Map<String, dynamic> req, Identity id, bool approve) async {
    final idp = (req['idp'] ?? Cfg.idpUrl).toString();
    final body = <String, dynamic>{'username': id.username, 'uid': req['uid']};
    if (approve) {
      body['signature'] = await id.sign(req['nonce'].toString());
    } else {
      body['decision'] = 'deny';
    }
    await http.post(Uri.parse('$idp/device/approve'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(body));
    if (mounted) {
      setState(() => _pushes.remove(req));
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(approve ? 'Firmado como ${id.username} ✓' : 'Rechazado'),
          backgroundColor: approve ? ok : const Color(0xFF334155)));
    }
  }

  /// Añade otra identidad (abre el Gate) y se suscribe a su push.
  Future<void> _addIdentity() async {
    final id = await Navigator.of(context).push<Identity>(MaterialPageRoute(builder: (_) => const Gate()));
    if (id == null || !mounted) return;
    if (!_ids.any((e) => e.username == id.username)) {
      _ids.add(id);
      _mqtt?.subscribe(_topic(id.username), MqttQos.atMostOnce);
    }
    setState(() {});
  }

  void _removeIdentity(Identity id) {
    Vault.remove(id.username);
    try { _mqtt?.unsubscribe(_topic(id.username)); } catch (_) {}
    _ids.removeWhere((e) => e.username == id.username);
    if (_ids.isEmpty) {
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const Gate()));
    } else {
      setState(() {});
    }
  }

  /// Escanea un QR de login. Como el QR no dice el usuario, eliges la identidad.
  Future<void> _scan() async {
    final result = await Navigator.of(context).push<Map<String, dynamic>>(MaterialPageRoute(builder: (_) => const ScanPage()));
    if (result == null || !mounted) return;
    final id = await _pickIdentity(result['client']?.toString());
    if (id == null) return;
    await _respond(result, id, true);
  }

  /// Selector: si hay una sola identidad la usa; si hay varias, pregunta.
  Future<Identity?> _pickIdentity(String? client) async {
    if (_ids.length == 1) {
      final confirm = await _confirmDialog(client, _ids.first);
      return confirm == true ? _ids.first : null;
    }
    return showDialog<Identity>(
      context: context,
      builder: (_) => SimpleDialog(
        backgroundColor: card,
        title: Text('¿Con qué identidad entras${client != null ? ' a $client' : ''}?'),
        children: [
          for (final id in _ids)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, id),
              child: Row(children: [
                CircleAvatar(radius: 16, backgroundColor: accent, child: Text(id.username.isNotEmpty ? id.username[0].toUpperCase() : '?', style: const TextStyle(color: bg, fontWeight: FontWeight.w900, fontSize: 13))),
                const SizedBox(width: 12),
                Text(id.username, style: const TextStyle(fontWeight: FontWeight.w700)),
              ]),
            ),
        ],
      ),
    );
  }

  Future<bool?> _confirmDialog(String? client, Identity id) => showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          backgroundColor: card,
          title: const Text('Solicitud de acceso'),
          content: Text('${client ?? 'Una app'} quiere iniciar tu sesión como "${id.username}".\nFirmarás el reto con tu llave.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Rechazar', style: TextStyle(color: Color(0xFFF87171)))),
            FilledButton(onPressed: () => Navigator.pop(context, true), style: FilledButton.styleFrom(backgroundColor: ok, foregroundColor: bg), child: const Text('Aprobar y firmar')),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: ListView(padding: const EdgeInsets.all(22), children: [
            Row(children: [
              const Expanded(child: _Logo()),
              _Badge(_mqttState, _mqttState == 'push activo' ? ok : Colors.grey),
            ]),
            const SizedBox(height: 18),
            Text('MIS IDENTIDADES', style: TextStyle(color: Colors.grey.shade500, fontSize: 12, letterSpacing: .5)),
            const SizedBox(height: 8),
            ..._ids.map((id) => Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(16), border: Border.all(color: line)),
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    CircleAvatar(radius: 20, backgroundColor: accent, child: Text(id.username.isNotEmpty ? id.username[0].toUpperCase() : '?', style: const TextStyle(color: bg, fontWeight: FontWeight.w900))),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(id.username, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                      Text('Ed25519 · ${id.username}@tripleenable.com', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
                    ])),
                    IconButton(
                      tooltip: 'Quitar de este dispositivo',
                      onPressed: () => _removeIdentity(id),
                      icon: Icon(Icons.close, size: 18, color: Colors.grey.shade600),
                    ),
                  ]),
                )),
            OutlinedButton.icon(
              onPressed: _addIdentity,
              style: OutlinedButton.styleFrom(foregroundColor: accent, side: BorderSide(color: accent.withValues(alpha: .5)), padding: const EdgeInsets.symmetric(vertical: 13)),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Añadir otra identidad', style: TextStyle(fontWeight: FontWeight.w700)),
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
                  child: Text('Sin solicitudes. En la pantalla de login del IdP, envía un push a una de tus identidades.', style: TextStyle(color: Colors.grey.shade400))),
            ..._pushes.map((r) {
              final id = _byUser(r['_forUser']?.toString());
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(14), border: Border.all(color: line)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${r['client'] ?? 'Una app'} quiere iniciar tu sesión', style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text('como ${r['_forUser']}', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
                  const SizedBox(height: 10),
                  if (id == null)
                    Text('No tienes esa identidad en este dispositivo.', style: TextStyle(color: Colors.orange.shade300, fontSize: 12))
                  else
                    Row(children: [
                      Expanded(child: FilledButton(onPressed: () => _respond(r, id, true), style: FilledButton.styleFrom(backgroundColor: ok, foregroundColor: bg), child: const Text('Aprobar'))),
                      const SizedBox(width: 10),
                      Expanded(child: OutlinedButton(onPressed: () => _respond(r, id, false), style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFF87171)), child: const Text('Rechazar'))),
                    ]),
                ]),
              );
            }),
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
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 38, height: 38, decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), gradient: LinearGradient(colors: [accent, ok])),
            child: const Center(child: Text('T', style: TextStyle(color: bg, fontWeight: FontWeight.w900, fontSize: 20)))),
        const SizedBox(width: 10),
        const Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Tripleenable Wallet', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          Text('autenticador soberano', style: TextStyle(color: Color(0xFF93A1BD), fontSize: 11)),
        ]),
        if (Cfg.broker.isNotEmpty) ...[
          const SizedBox(width: 10),
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
