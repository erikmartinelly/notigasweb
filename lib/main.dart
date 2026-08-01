import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

// ──────────────────────────────────────────────
// Enumeraciones & Modelos de Datos
// ──────────────────────────────────────────────
enum RolUsuario { cliente, distribuidor, vendedorOtros, administrador }

enum EstiloMapaHD {
  geoBolivia(
    'GeoBolivia HD (Cartografía Oficial)',
    'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
    Icons.map,
  ),
  sateliteHD(
    'Satélite HD (Imágenes Satelitales)',
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    Icons.satellite,
  ),
  modoNoche(
    'Noche HD (Tema Oscuro)',
    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
    Icons.dark_mode,
  ),
  googleStaticHD(
    'Google Maps Estático HD (Sin API Key Gratis)',
    'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    Icons.map_outlined,
  ),
  estandarOSM(
    'Mapa Estándar de Calles (OpenStreetMap)',
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    Icons.public,
  );

  const EstiloMapaHD(this.nombre, this.urlTemplate, this.icono);
  final String nombre;
  final String urlTemplate;
  final IconData icono;
}

enum CategoriaPedido {
  gas('Gas GLP (Garrafa)', Icons.local_fire_department, Color(0xFFE65100)),
  chatarra('Recojo de Chatarra y Papel', Icons.recycling, Color(0xFF388E3C)),
  detergentes('Detergentes Líquidos a Granel', Icons.cleaning_services, Color(0xFF7B1FA2)),
  agua('Agua en Botellón 20L', Icons.water_drop, Color(0xFF0288D1)),
  frutas('Frutas Frescas y Verduras', Icons.apple, Color(0xFFF57C00)),
  otras('Otros Pedidos / Encargos', Icons.edit_note, Color(0xFF616161));

  const CategoriaPedido(this.etiqueta, this.icono, this.color);
  final String etiqueta;
  final IconData icono;
  final Color color;
}

enum TipoPublicacion { pedido, avisoBarrio, rutaDistribuidor }

enum MotivoDenuncia {
  spam('Spam o publicidad engañosa'),
  insultos('Insultos o acoso'),
  politica('Discusiones políticas'),
  otro('Otro motivo grave');

  const MotivoDenuncia(this.descripcion);
  final String descripcion;
}

class OTBGeo {
  const OTBGeo(this.nombre, this.punto);
  final String nombre;
  final LatLng punto;
}

class Ciudad {
  const Ciudad(this.nombre, this.regionMetropolitana, this.punto, this.zoom, this.otbs);
  final String nombre;
  final String regionMetropolitana;
  final LatLng punto;
  final double zoom;
  final List<OTBGeo> otbs;
}

const String CLAVE_ADMIN_SECRETA = 'Tiquipaya4532066';
const String WHATSAPP_HABILITACION_ADMIN = '70712345';

String anonimizarEmail(String email) {
  if (email.contains('@')) {
    final usuario = email.split('@').first;
    if (usuario.length > 3) {
      return '${usuario.substring(0, 3)}***@gmail.com';
    }
  }
  return 'Vecino_Anónimo_${email.hashCode.abs() % 1000}';
}

class RutaSemanalGuardada {
  RutaSemanalGuardada({
    required this.id,
    required this.diaSemana,
    required this.nombreRuta,
    required this.barrioOTB,
    required this.horarioAproximado,
    required this.puntosCoordenadas,
  });

  final String id;
  final String diaSemana;
  final String nombreRuta;
  final String barrioOTB;
  final String horarioAproximado;
  final List<LatLng> puntosCoordenadas;
}

const List<Ciudad> ciudadesBolivia = [
  // 🇧🇴 BOLIVIA - 9 CIUDADES CAPITALES & ÁREAS METROPOLITANAS
  Ciudad('Cochabamba (Metrópoli Kanata)', '🇧🇴 Bolivia - Depto. Cochabamba', LatLng(-17.3895, -66.1568), 13.0, [
    OTBGeo('Cercado: OTB Queru Queru', LatLng(-17.3750, -66.1550)),
    OTBGeo('Cercado: OTB Tupuraya', LatLng(-17.3780, -66.1480)),
    OTBGeo('Cercado: OTB Cala Cala', LatLng(-17.3710, -66.1620)),
    OTBGeo('Quillacollo: OTB Tacata', LatLng(-17.3900, -66.2900)),
    OTBGeo('Sacaba: OTB Huayllani', LatLng(-17.4010, -66.0800)),
    OTBGeo('Tiquipaya: OTB Trojes', LatLng(-17.3450, -66.2100)),
    OTBGeo('Colcapirhua / Vinto', LatLng(-17.3880, -66.2400)),
  ]),
  Ciudad('Santa Cruz de la Sierra (Metrópoli)', '🇧🇴 Bolivia - Depto. Santa Cruz', LatLng(-17.7833, -63.1833), 12.5, [
    OTBGeo('Santa Cruz: Equipetrol', LatLng(-17.7650, -63.1950)),
    OTBGeo('Santa Cruz: Plan 3000', LatLng(-17.8250, -63.1350)),
    OTBGeo('Santa Cruz: Villa 1ro de Mayo', LatLng(-17.7950, -63.1380)),
    OTBGeo('Warnes: Satélite Norte', LatLng(-17.6100, -63.1600)),
    OTBGeo('Cotoca / La Guardia', LatLng(-17.8000, -63.0500)),
  ]),
  Ciudad('La Paz & El Alto (Metrópoli)', '🇧🇴 Bolivia - Depto. La Paz', LatLng(-16.5000, -68.1500), 13.0, [
    OTBGeo('La Paz: Sopocachi', LatLng(-16.5100, -68.1300)),
    OTBGeo('La Paz: Miraflores', LatLng(-16.5000, -68.1200)),
    OTBGeo('La Paz: Zona Sur Calacoto', LatLng(-16.5400, -68.0900)),
    OTBGeo('El Alto: Ciudad Satélite', LatLng(-16.5200, -68.1700)),
    OTBGeo('El Alto: Villa Adela / Senkata', LatLng(-16.5150, -68.2100)),
    OTBGeo('Viacha / Achocalla', LatLng(-16.6500, -68.3000)),
  ]),
  Ciudad('Sucre', '🇧🇴 Bolivia - Cap. Chuquisaca', LatLng(-19.0452, -65.2590), 13.0, [
    OTBGeo('Barrio Petrolero', LatLng(-19.0400, -65.2500)),
    OTBGeo('Zona Central Sucre', LatLng(-19.0452, -65.2590)),
  ]),
  Ciudad('Tarija', '🇧🇴 Bolivia - Cap. Tarija', LatLng(-21.5355, -64.7295), 13.0, [
    OTBGeo('Barrio Senac', LatLng(-21.5400, -64.7350)),
    OTBGeo('Zona Central Tarija', LatLng(-21.5355, -64.7295)),
  ]),
  Ciudad('Oruro', '🇧🇴 Bolivia - Cap. Oruro', LatLng(-17.9647, -67.1064), 13.0, [
    OTBGeo('Barrio San José', LatLng(-17.9700, -67.1100)),
    OTBGeo('Zona Central Oruro', LatLng(-17.9647, -67.1064)),
  ]),
  Ciudad('Potosí', '🇧🇴 Bolivia - Cap. Potosí', LatLng(-19.5836, -65.7531), 13.0, [
    OTBGeo('Barrio Cantumarca', LatLng(-19.5900, -65.7600)),
    OTBGeo('Zona Central Potosí', LatLng(-19.5836, -65.7531)),
  ]),
  Ciudad('Trinidad', '🇧🇴 Bolivia - Cap. Beni', LatLng(-14.8333, -64.9000), 13.0, [
    OTBGeo('Barrio Pompeya', LatLng(-14.8300, -64.9050)),
    OTBGeo('Zona Central Trinidad', LatLng(-14.8333, -64.9000)),
  ]),
  Ciudad('Cobija', '🇧🇴 Bolivia - Cap. Pando', LatLng(-11.0267, -68.7692), 13.0, [
    OTBGeo('Barrio Mapajo', LatLng(-11.0280, -68.7700)),
    OTBGeo('Zona Central Cobija', LatLng(-11.0267, -68.7692)),
  ]),
];

final ciudadInicial = ciudadesBolivia.first;

class MensajeChatPrivado {
  MensajeChatPrivado({
    required this.id,
    required this.categoriaServicio,
    required this.barrioOTB,
    required this.autorEmail,
    required this.autorRole,
    required this.aliasProtegido,
    required this.texto,
    required this.timestamp,
    this.denunciado = false,
  });

  final String id;
  final CategoriaPedido categoriaServicio;
  final String barrioOTB;
  final String autorEmail;
  final RolUsuario autorRole;
  final String aliasProtegido;
  final String texto;
  final DateTime timestamp;
  bool denunciado;

  bool get expirado => DateTime.now().difference(timestamp).inHours >= 168; // 7 Días (Cero Costo en Supabase)
}

class PublicacionItem {
  PublicacionItem({
    required this.id,
    required this.tipo,
    required this.categoria,
    required this.titulo,
    required this.descripcion,
    required this.ciudad,
    required this.barrioOTB,
    required this.userEmail,
    required this.userRole,
    required this.point,
    required this.createdAt,
    this.distribuidorNombre,
    this.distribuidorCI,
    this.horarioRecorrido,
    this.puntosTrazoRuta,
    this.garrafasAgotadas = false,
    this.esPromocion = false,
    this.ofertaTexto,
  });

  final String id;
  final TipoPublicacion tipo;
  final CategoriaPedido categoria;
  final String titulo;
  final String descripcion;
  final String ciudad;
  final String barrioOTB;
  final String userEmail;
  final RolUsuario userRole;
  LatLng point;
  final DateTime createdAt;

  final String? distribuidorNombre;
  final String? distribuidorCI;
  final String? horarioRecorrido;
  final List<LatLng>? puntosTrazoRuta;
  bool garrafasAgotadas;

  final bool esPromocion;
  final String? ofertaTexto;

  bool get expirada {
    final limiteHoras = (tipo == TipoPublicacion.pedido) ? 72 : 168; // 72h para pedidos/avisos, 168h (7 días) para chats
    return DateTime.now().difference(createdAt).inHours >= limiteHoras;
  }

  int get horasRestantes {
    final limiteHoras = (tipo == TipoPublicacion.pedido) ? 72 : 168;
    return limiteHoras - DateTime.now().difference(createdAt).inHours;
  }
}

bool supabaseConfigured = false;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const url = String.fromEnvironment('SUPABASE_URL', defaultValue: 'https://yxzzfqyehllogzzhdtmc.supabase.co');
  const key = String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: 'sb_publishable_wWVQ59Rejod5Oc1X4s_eeQ_ONbXzyi2');
  if (url.isNotEmpty && key.isNotEmpty) {
    try {
      await Supabase.initialize(url: url, anonKey: key);
      supabaseConfigured = true;
    } catch (_) {}
  }
  runApp(const NotigasApp());
}

// ──────────────────────────────────────────────
// Dibujo Garrafa Vectorial GLP
// ──────────────────────────────────────────────
class GarrafaPainter extends CustomPainter {
  GarrafaPainter({
    this.colorGarrafa = const Color(0xFFE65100),
    this.resaltada = false,
  });

  final Color colorGarrafa;
  final bool resaltada;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final colorActual = resaltada ? const Color(0xFFFF1744) : colorGarrafa;

    final paintBody = Paint()
      ..shader = LinearGradient(
        colors: [colorActual.withOpacity(0.95), colorActual, const Color(0xFF8D6E63)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ).createShader(Rect.fromLTWH(0, 0, w, h))
      ..style = PaintingStyle.fill;

    final paintMetalDark = Paint()
      ..color = const Color(0xFF1C313E)
      ..style = PaintingStyle.fill;

    final baseRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(w * 0.22, h * 0.88, w * 0.56, h * 0.10),
      const Radius.circular(6),
    );
    canvas.drawRRect(baseRect, paintMetalDark);

    final bodyPath = Path()
      ..moveTo(w * 0.20, h * 0.38)
      ..cubicTo(w * 0.14, h * 0.50, w * 0.14, h * 0.78, w * 0.20, h * 0.86)
      ..quadraticBezierTo(w * 0.50, h * 0.90, w * 0.80, h * 0.86)
      ..cubicTo(w * 0.86, h * 0.78, w * 0.86, h * 0.50, w * 0.80, h * 0.38)
      ..quadraticBezierTo(w * 0.50, h * 0.34, w * 0.20, h * 0.38)
      ..close();
    canvas.drawPath(bodyPath, paintBody);

    final paintSeam = Paint()
      ..color = Colors.white.withOpacity(0.35)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;
    canvas.drawLine(Offset(w * 0.15, h * 0.62), Offset(w * 0.85, h * 0.62), paintSeam);

    final valveRect = Rect.fromLTWH(w * 0.42, h * 0.24, w * 0.16, h * 0.12);
    final paintValve = Paint()..color = const Color(0xFFFFB300);
    canvas.drawRect(valveRect, paintValve);

    final textPainter = TextPainter(
      text: TextSpan(
        text: resaltada ? '¡AQUÍ!' : 'GLP',
        style: const TextStyle(
          color: Colors.white,
          fontSize: 9,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.0,
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    textPainter.paint(canvas, Offset((w - textPainter.width) / 2, h * 0.54));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

class GarrafaIcon extends StatelessWidget {
  const GarrafaIcon({
    super.key,
    this.size = 36.0,
    this.color = const Color(0xFFE65100),
    this.resaltada = false,
  });

  final double size;
  final Color color;
  final bool resaltada;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size * 1.2),
      painter: GarrafaPainter(colorGarrafa: color, resaltada: resaltada),
    );
  }
}

// ──────────────────────────────────────────────
// MARCADOR ANIMADO DE PUNTOS DESTELLANTES (BEACON)
// ──────────────────────────────────────────────
class PulsingBeaconMarker extends StatefulWidget {
  const PulsingBeaconMarker({
    super.key,
    required this.child,
    this.glowColor = const Color(0xFFFF6D00),
    this.isPanic = false,
    this.onTap,
  });

  final Widget child;
  final Color glowColor;
  final bool isPanic;
  final VoidCallback? onTap;

  @override
  State<PulsingBeaconMarker> createState() => _PulsingBeaconMarkerState();
}

class _PulsingBeaconMarkerState extends State<PulsingBeaconMarker> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnim;
  late Animation<double> _opacityAnim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: widget.isPanic ? 700 : 1300),
    )..repeat(reverse: true);

    _scaleAnim = Tween<double>(begin: 0.9, end: 1.25).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );

    _opacityAnim = Tween<double>(begin: 0.35, end: 0.95).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Transform.scale(
            scale: _scaleAnim.value,
            child: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: widget.glowColor.withValues(alpha: _opacityAnim.value),
                    blurRadius: widget.isPanic ? 22 : 14,
                    spreadRadius: widget.isPanic ? 8 : 4,
                  ),
                ],
              ),
              child: widget.child,
            ),
          );
        },
      ),
    );
  }
}

// ──────────────────────────────────────────────
// MARCADOR ANIMADO DEL CAMIÓN EN MOVIMIENTO
// ──────────────────────────────────────────────
class AnimatedTruckMarker extends StatefulWidget {
  const AnimatedTruckMarker({
    super.key,
    required this.titulo,
    required this.iconoSub,
    required this.colorBg,
    required this.detenido,
    required this.onTap,
  });

  final String titulo;
  final IconData iconoSub;
  final Color colorBg;
  final bool detenido;
  final VoidCallback onTap;

  @override
  State<AnimatedTruckMarker> createState() => _AnimatedTruckMarkerState();
}

class _AnimatedTruckMarkerState extends State<AnimatedTruckMarker> with SingleTickerProviderStateMixin {
  late AnimationController _wobbleController;
  late Animation<double> _wobbleAnim;

  @override
  void initState() {
    super.initState();
    _wobbleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _wobbleAnim = Tween<double>(begin: -0.05, end: 0.05).animate(
      CurvedAnimation(parent: _wobbleController, curve: Curves.easeInOut),
    );

    if (!widget.detenido) {
      _wobbleController.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(covariant AnimatedTruckMarker oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.detenido != oldWidget.detenido) {
      if (widget.detenido) {
        _wobbleController.stop();
      } else {
        _wobbleController.repeat(reverse: true);
      }
    }
  }

  @override
  void dispose() {
    _wobbleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _wobbleController,
        builder: (context, child) {
          return Transform.rotate(
            angle: widget.detenido ? 0.0 : _wobbleAnim.value,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: widget.detenido ? Colors.green.shade900 : const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: widget.detenido ? Colors.greenAccent : Colors.amberAccent,
                      width: 1.5,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: widget.detenido
                            ? Colors.greenAccent.withValues(alpha: 0.5)
                            : Colors.amberAccent.withValues(alpha: 0.5),
                        blurRadius: 10,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                  child: Text(
                    widget.titulo,
                    style: TextStyle(
                      color: widget.detenido ? Colors.greenAccent : Colors.amberAccent,
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(height: 3),
                Container(
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: widget.colorBg,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2.5),
                    boxShadow: [
                      BoxShadow(
                        color: widget.colorBg.withValues(alpha: 0.8),
                        blurRadius: 14,
                        spreadRadius: 3,
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const GarrafaIcon(size: 16, color: Colors.white),
                      const SizedBox(width: 3),
                      Icon(widget.iconoSub, color: Colors.white, size: 22),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ──────────────────────────────────────────────
// App Principal
// ──────────────────────────────────────────────
class NotigasApp extends StatelessWidget {
  const NotigasApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'NOTIGAS - Gas, Chatarra, Detergentes, Agua & Otros Pedidos',
      locale: const Locale('es', 'ES'),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('es', 'ES'),
      ],
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFE65100),
          primary: const Color(0xFFE65100),
          secondary: const Color(0xFF0288D1),
          surface: Colors.grey.shade50,
          brightness: Brightness.light,
        ),
        fontFamily: 'Roboto',
        useMaterial3: true,
      ),
      home: const PantallaPrincipalNav(),
    );
  }
}

// ──────────────────────────────────────────────
// Pantalla Principal
// ──────────────────────────────────────────────
class PantallaPrincipalNav extends StatefulWidget {
  const PantallaPrincipalNav({super.key});

  @override
  State<PantallaPrincipalNav> createState() => _PantallaPrincipalNavState();
}

class _PantallaPrincipalNavState extends State<PantallaPrincipalNav> {
  int indicePestanaActual = 0;
  final mapController = MapController();

  EstiloMapaHD estiloMapaActual = EstiloMapaHD.geoBolivia;

  String? usuarioGmail = 'erikmartinelly@gmail.com';
  RolUsuario rolActual = RolUsuario.cliente;
  final List<String> usuariosBaneados = [];
  final List<String> correosAdministradores = ['erikmartinelly@gmail.com'];

  String textoAnuncioNativoSistema = 'Distribuidoras autorizadas & Comercios de la OTB en tu zona';
  String? urlAnuncioNativoSistema = 'https://wa.me/59170712345';

  String? distribuidorNombre = 'Roberto Carlos Vargas';
  String? distribuidorCI = '7841209 CB';

  bool garrafasAgotadasGlobal = false;
  List<OTBGeo> otbsIluminadas = [];

  Ciudad ciudadActual = ciudadInicial;
  late OTBGeo otbActualGeo;

  bool grabandoRutaGPS = false;
  List<LatLng> coordenadasGrabadasEnVivo = [];

  // Transmisión GPS Nativo en Tiempo Real
  bool transmitiendoGPSCamion = true;
  Timer? timerGPSCamion;
  LatLng ubicacionCamionLive = const LatLng(-17.3760, -66.1555);
  int pasoSimulacion = 0;

  late final List<PublicacionItem> publicaciones;
  late final List<MensajeChatPrivado> mensajesChatPrivados;

  @override
  void initState() {
    super.initState();
    otbActualGeo = ciudadActual.otbs.first;
    otbsIluminadas = [otbActualGeo];

    publicaciones = [
      PublicacionItem(
        id: 'demo-gas-1',
        tipo: TipoPublicacion.pedido,
        categoria: CategoriaPedido.gas,
        titulo: 'Pedido: Garrafa de Gas GLP',
        descripcion: '1 Garrafa de GLP en puerta.',
        ciudad: 'Cochabamba (Cercado)',
        barrioOTB: 'OTB Queru Queru',
        userEmail: 'vecina.protegida@gmail.com',
        userRole: RolUsuario.cliente,
        point: const LatLng(-17.3750, -66.1550),
        createdAt: DateTime.now().subtract(const Duration(hours: 2)),
      ),
      PublicacionItem(
        id: 'demo-otros-1',
        tipo: TipoPublicacion.pedido,
        categoria: CategoriaPedido.otras,
        titulo: '📝 OTROS PEDIDOS: Recojo de Pan y Hielo',
        descripcion: 'Encargo especial a domicilio.',
        ciudad: 'Cochabamba (Cercado)',
        barrioOTB: 'OTB Queru Queru',
        userEmail: 'vecino.encargo@gmail.com',
        userRole: RolUsuario.cliente,
        point: const LatLng(-17.3770, -66.1530),
        createdAt: DateTime.now().subtract(const Duration(hours: 1)),
      ),
    ];

    mensajesChatPrivados = [];

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!rolInicialConfirmado) {
        _mostrarModalSeleccionModalidadInicial();
      } else {
        _solicitarActivarGPSComprador();
      }
    });

    _iniciarTransmisionGPSCamion();
    _sincronizarSupabaseRemoto();
  }

  bool rolInicialConfirmado = false;

  Future<void> _sincronizarSupabaseRemoto() async {
    if (!supabaseConfigured) return;
    try {
      final response = await Supabase.instance.client
          .from('publicaciones')
          .select()
          .order('created_at', ascending: false);
      if (response != null && response is List && response.isNotEmpty) {
        final List<PublicacionItem> remotos = [];
        for (var row in response) {
          remotos.add(
            PublicacionItem(
              id: row['id']?.toString() ?? DateTime.now().microsecondsSinceEpoch.toString(),
              tipo: row['tipo'] == 'rutaDistribuidor'
                  ? TipoPublicacion.rutaDistribuidor
                  : (row['tipo'] == 'avisoBarrio' ? TipoPublicacion.avisoBarrio : TipoPublicacion.pedido),
              categoria: CategoriaPedido.values.firstWhere(
                (c) => c.name == row['categoria'],
                orElse: () => CategoriaPedido.gas,
              ),
              titulo: row['titulo'] ?? 'Aviso NOTIGAS',
              descripcion: row['descripcion'] ?? '',
              ciudad: row['ciudad'] ?? 'Cochabamba',
              barrioOTB: row['barrio_otb'] ?? 'Centro',
              userEmail: row['user_email'] ?? 'vecino@gmail.com',
              userRole: RolUsuario.cliente,
              point: LatLng(
                (row['latitud'] as num?)?.toDouble() ?? -17.3895,
                (row['longitud'] as num?)?.toDouble() ?? -66.1568,
              ),
              createdAt: DateTime.tryParse(row['created_at']?.toString() ?? '') ?? DateTime.now(),
            ),
          );
        }
        if (mounted) {
          setState(() {
            publicaciones = remotos;
          });
        }
      }
    } catch (e) {
      debugPrint('Sincronización remota Supabase: $e');
    }
  }

  Future<void> _subirPublicacionSupabase(PublicacionItem item) async {
    if (!supabaseConfigured) return;
    try {
      await Supabase.instance.client.from('publicaciones').insert({
        'tipo': item.tipo.name,
        'categoria': item.categoria.name,
        'titulo': item.titulo,
        'descripcion': item.descripcion,
        'ciudad': item.ciudad,
        'barrio_otb': item.barrioOTB,
        'user_email': item.userEmail,
        'user_role': item.userRole.name,
        'latitud': item.point.latitude,
        'longitud': item.point.longitude,
        'created_at': item.createdAt.toIso8601String(),
      });
    } catch (e) {
      debugPrint('Error publicando en Supabase: $e');
    }
  }

  @override
  void dispose() {
    timerGPSCamion?.cancel();
    super.dispose();
  }

  void _iniciarTransmisionGPSCamion() {
    timerGPSCamion = Timer.periodic(const Duration(seconds: 4), (timer) {
      if (!transmitiendoGPSCamion) return;

      pasoSimulacion++;
      final latDelta = 0.00015 * (pasoSimulacion % 2 == 0 ? 1 : 0.5);
      final lngDelta = 0.00015 * (pasoSimulacion % 3 == 0 ? 1 : -0.5);

      setState(() {
        ubicacionCamionLive = LatLng(
          ubicacionCamionLive.latitude + latDelta,
          ubicacionCamionLive.longitude + lngDelta,
        );
      });
    });
  }

  void _limpiarExpirados() {
    publicaciones.removeWhere((p) => p.expirada);
    mensajesChatPrivados.removeWhere((m) => m.expirado);
  }

  @override
  Widget build(BuildContext context) {
    _limpiarExpirados();
    final pedidosActivos = publicaciones.where((p) => p.tipo == TipoPublicacion.pedido).toList();
    final rutasDistribuidor = publicaciones.where((p) => p.tipo == TipoPublicacion.rutaDistribuidor).toList();

    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        backgroundColor: const Color(0xFF1E293B),
        foregroundColor: Colors.white,
        title: Row(
          children: [
            const GarrafaIcon(size: 24, color: Color(0xFFFF6D00)),
            const SizedBox(width: 8),
            const Text(
              'NOTIGAS',
              style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2, fontSize: 18),
            ),
            const SizedBox(width: 10),
            InkWell(
              onTap: _mostrarModalSeleccionModalidadInicial,
              borderRadius: BorderRadius.circular(20),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: rolActual == RolUsuario.distribuidor ? const Color(0xFFD84315) : const Color(0xFF0288D1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      rolActual == RolUsuario.distribuidor ? Icons.local_shipping : Icons.person,
                      size: 14,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      rolActual == RolUsuario.distribuidor
                          ? 'Chofer GLP'
                          : (rolActual == RolUsuario.vendedorOtros ? 'Vendedor' : 'Comprador'),
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        actions: [
          // BOTÓN DE AJUSTES Y CONFIGURACIÓN (ENGRANAJE)
          IconButton(
            icon: const Icon(Icons.settings, size: 22, color: Colors.white),
            tooltip: 'Ajustes & Configuración',
            onPressed: _mostrarModalAjustesConfiguracion,
          ),
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            onPressed: _mostrarSelectorUbicacion,
            icon: const Icon(Icons.location_on, size: 16, color: Color(0xFFFF6D00)),
            label: Text(
              '${ciudadActual.nombre} / ${otbActualGeo.nombre}',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 11),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),

      body: IndexedStack(
        index: indicePestanaActual,
        children: [
          // PESTAÑA 0: MAPA HD
          Stack(
            children: [
              FlutterMap(
                mapController: mapController,
                options: MapOptions(
                  initialCenter: ciudadActual.punto,
                  initialZoom: ciudadActual.zoom,
                  onTap: (_, punto) {
                    if (grabandoRutaGPS) {
                      setState(() {
                        coordenadasGrabadasEnVivo.add(punto);
                      });
                    }
                  },
                  onLongPress: (_, punto) => _abrirMenu1RealizarPedidoModal(puntoInicial: punto),
                ),
                children: [
                  TileLayer(
                    urlTemplate: estiloMapaActual.urlTemplate,
                    userAgentPackageName: 'bo.notigas.app',
                    tileSize: 256,
                    maxZoom: 19,
                  ),

                  CircleLayer(
                    circles: otbsIluminadas.map((otb) {
                      return CircleMarker(
                        point: otb.punto,
                        radius: 650,
                        useRadiusInMeter: true,
                        color: garrafasAgotadasGlobal
                            ? Colors.red.withOpacity(0.35)
                            : const Color(0xFFFF9800).withOpacity(0.38),
                        borderColor: garrafasAgotadasGlobal ? Colors.red : const Color(0xFFE65100),
                        borderStrokeWidth: 3.5,
                      );
                    }).toList(),
                  ),

                  if (transmitiendoGPSCamion)
                    CircleLayer(
                      circles: [
                        CircleMarker(
                          point: ubicacionCamionLive,
                          radius: 15,
                          useRadiusInMeter: true,
                          color: const Color(0xFF76FF03).withOpacity(0.35),
                          borderColor: const Color(0xFF64DD17),
                          borderStrokeWidth: 2.5,
                        ),
                      ],
                    ),

                  PolylineLayer(
                    polylines: [
                      if (coordenadasGrabadasEnVivo.length >= 2)
                        Polyline(
                          points: coordenadasGrabadasEnVivo,
                          strokeWidth: 5.5,
                          color: Colors.redAccent,
                        ),
                      ...rutasDistribuidor
                          .where((r) => r.puntosTrazoRuta != null && r.puntosTrazoRuta!.length >= 2)
                          .map(
                            (r) => Polyline(
                              points: r.puntosTrazoRuta!,
                              strokeWidth: 5.0,
                              color: r.garrafasAgotadas ? Colors.grey : const Color(0xFFD84315),
                            ),
                          ),
                    ],
                  ),

                  if (transmitiendoGPSCamion)
                    MarkerLayer(
                      markers: [
                        // 1. CAMIÓN GRANDE DE GAS GLP ("GASERO CERCA")
                        Marker(
                          point: ubicacionCamionLive,
                          width: 120,
                          height: 90,
                          child: AnimatedTruckMarker(
                            titulo: (pasoSimulacion % 4 == 0) ? '🅿️ GASERO DETENIDO' : '🚚 GASERO EN VIVO',
                            iconoSub: Icons.local_shipping,
                            colorBg: garrafasAgotadasGlobal ? Colors.grey.shade800 : const Color(0xFFD84315),
                            detenido: pasoSimulacion % 4 == 0,
                            onTap: _mostrarDetalleCamionLive,
                          ),
                        ),

                        // 2. CAMIONETA PEQUEÑA DE AGUA 20L (BOTELLÓN AGUATERO)
                        Marker(
                          point: LatLng(ubicacionCamionLive.latitude + 0.0018, ubicacionCamionLive.longitude - 0.0022),
                          width: 110,
                          height: 80,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0288D1),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  '🛻 AGUA 20L',
                                  style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Container(
                                padding: const EdgeInsets.all(5),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0288D1),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 2),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: const [
                                    Icon(Icons.water_drop, color: Colors.white, size: 16),
                                    SizedBox(width: 2),
                                    Icon(Icons.directions_car, color: Colors.white, size: 18),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),

                        // 3. FURGONCITO DE DETERGENTES A GRANEL
                        Marker(
                          point: LatLng(ubicacionCamionLive.latitude - 0.0021, ubicacionCamionLive.longitude + 0.0015),
                          width: 110,
                          height: 80,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF7B1FA2),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  '🚐 DETERGENTES',
                                  style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Container(
                                padding: const EdgeInsets.all(5),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF7B1FA2),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 2),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: const [
                                    Icon(Icons.cleaning_services, color: Colors.white, size: 16),
                                    SizedBox(width: 2),
                                    Icon(Icons.airport_shuttle, color: Colors.white, size: 18),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),

                        // 4. CAMIONETA ABIERTA DE CHATARRA Y PAPEL
                        Marker(
                          point: LatLng(ubicacionCamionLive.latitude + 0.0025, ubicacionCamionLive.longitude + 0.0020),
                          width: 110,
                          height: 80,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF388E3C),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  '🛻 CHATARRA',
                                  style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Container(
                                padding: const EdgeInsets.all(5),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF388E3C),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 2),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: const [
                                    Icon(Icons.recycling, color: Colors.white, size: 16),
                                    SizedBox(width: 2),
                                    Icon(Icons.directions_car, color: Colors.white, size: 18),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),

                        // 5. CAMIONETA ABIERTA DE FRUTAS Y VERDURAS
                        Marker(
                          point: LatLng(ubicacionCamionLive.latitude - 0.0015, ubicacionCamionLive.longitude - 0.0025),
                          width: 110,
                          height: 80,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFE53935),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  '🛻 FRUTERO',
                                  style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Container(
                                padding: const EdgeInsets.all(5),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFE53935),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 2),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: const [
                                    Icon(Icons.shopping_basket, color: Colors.white, size: 16),
                                    SizedBox(width: 2),
                                    Icon(Icons.directions_car, color: Colors.white, size: 18),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                  MarkerLayer(
                    markers: pedidosActivos.map((ped) {
                      final esGas = ped.categoria == CategoriaPedido.gas;

                      return Marker(
                        point: ped.point,
                        width: 60,
                        height: 70,
                        child: PulsingBeaconMarker(
                          glowColor: ped.categoria.color,
                          isPanic: ped.titulo.contains('STOP') || ped.titulo.contains('ESPERA'),
                          onTap: () => _mostrarDetalleItem(ped),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(5),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: ped.categoria.color, width: 2),
                                  boxShadow: [
                                    BoxShadow(
                                      color: ped.categoria.color.withValues(alpha: 0.6),
                                      blurRadius: 10,
                                      spreadRadius: 2,
                                    ),
                                  ],
                                ),
                                child: esGas
                                    ? const GarrafaIcon(size: 28)
                                    : Icon(ped.categoria.icono, color: ped.categoria.color, size: 26),
                              ),
                              Icon(Icons.arrow_drop_down, color: ped.categoria.color, size: 18),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),

              Positioned(
                left: 14,
                right: 14,
                top: 14,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.2),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      )
                    ],
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.gps_fixed, color: Color(0xFF76FF03), size: 24),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              transmitiendoGPSCamion
                                  ? '🚚 CAMIÓN EN VIVO (Precisión 15m)'
                                  : '⚠️ CAMIÓN SIN TRANSMISIÓN GPS',
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.white),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              transmitiendoGPSCamion
                                  ? 'Pide Gas GLP, Chatarra, Detergentes, Agua u Otros Pedidos.'
                                  : 'El chofer no ha iniciado la transmisión GPS.',
                              style: const TextStyle(fontSize: 10, color: Colors.white70, height: 1.2),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              Positioned(
                top: 86,
                right: 14,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.2),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      )
                    ],
                  ),
                  child: PopupMenuButton<EstiloMapaHD>(
                    icon: Icon(estiloMapaActual.icono, color: const Color(0xFFE65100)),
                    tooltip: 'Estilo de Mapa HD',
                    onSelected: (estilo) => setState(() => estiloMapaActual = estilo),
                    itemBuilder: (context) => EstiloMapaHD.values
                        .map((e) => PopupMenuItem(value: e, child: Text(e.nombre, style: const TextStyle(fontSize: 12))))
                        .toList(),
                  ),
                ),
              ),

              if (rolActual == RolUsuario.distribuidor)
                Positioned(
                  bottom: 24,
                  right: 16,
                  child: FloatingActionButton.extended(
                    heroTag: 'btnChoferOpciones',
                    onPressed: _abrirMenuChoferModal,
                    backgroundColor: const Color(0xFFD84315),
                    foregroundColor: Colors.white,
                    icon: const Icon(Icons.build),
                    label: const Text('⚡ OPCIONES DE CHOFER', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13)),
                  ),
                )
              else if (rolActual == RolUsuario.vendedorOtros)
                Positioned(
                  bottom: 24,
                  right: 16,
                  child: FloatingActionButton.extended(
                    heroTag: 'btnVendedorAnunciar',
                    onPressed: _abrirModalAnunciarVendedorOtros,
                    backgroundColor: const Color(0xFF0288D1),
                    foregroundColor: Colors.white,
                    elevation: 6,
                    icon: const Icon(Icons.campaign),
                    label: const Text(
                      '📢 ANUNCIAR RECORRIDO / PROMOCIÓN',
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13),
                    ),
                  ),
                )
              else
                Positioned(
                  bottom: 24,
                  left: 14,
                  right: 14,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // SI HAY PEDIDO ACTIVO: MOSTRAR BOTÓN DESTACADO DE CANCELACIÓN
                      if (pedidosActivos.isNotEmpty) ...[
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFB71C1C),
                              foregroundColor: Colors.white,
                              elevation: 6,
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                            ),
                            onPressed: _mostrarModalCancelarPedidoActivo,
                            icon: const Icon(Icons.cancel, size: 18),
                            label: const Text(
                              '❌ CANCELAR PEDIDO DE GAS (Motivos)',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],

                      Row(
                        children: [
                          // BOTÓN DE PÁNICO COMPACTO: 🛑 ESPÉRAME (CON ICONO DE CAMIÓN)
                          SizedBox(
                            height: 48,
                            child: ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFFFF1744),
                                foregroundColor: Colors.white,
                                elevation: 8,
                                padding: const EdgeInsets.symmetric(horizontal: 14),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                              ),
                              onPressed: _dispararAlertaEsperaTeSigo,
                              icon: const Icon(Icons.local_shipping, size: 22),
                              label: const Text(
                                '🛑 ESPÉRAME',
                                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 0.5),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          // BOTÓN DE AVISO/PEDIDO DE GAS COMPACTO: 🔔 PEDIDO
                          Expanded(
                            child: SizedBox(
                              height: 48,
                              child: FloatingActionButton.extended(
                                heroTag: 'btnMenu1PedidosUnico',
                                onPressed: () => _abrirMenu1RealizarPedidoModal(),
                                backgroundColor: const Color(0xFFE65100),
                                foregroundColor: Colors.white,
                                elevation: 6,
                                icon: const GarrafaIcon(size: 20, color: Colors.white),
                                label: const Text(
                                  '🔔 PEDIDO',
                                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
            ],
          ),

          _PestanaAvisosBarrio(
            publicaciones: publicaciones,
            rolActual: rolActual,
            alCrearAviso: () => _abrirCrearAvisoModal(),
            alProgramarRuta: () => _abrirModalAnunciarBarrioEIluminarMapa(),
            textoAnuncioNativo: textoAnuncioNativoSistema,
            urlAnuncioNativo: urlAnuncioNativoSistema,
          ),

          if (rolActual != RolUsuario.distribuidor)
            _PestanaChatPrivadoVendedores(
              ciudadActual: ciudadActual.nombre,
              otbActual: otbActualGeo.nombre,
              usuarioGmail: usuarioGmail ?? 'vecino@gmail.com',
              rolActual: rolActual,
              mensajes: mensajesChatPrivados,
              alEnviarMensaje: (texto, categoria) {
                setState(() {
                  mensajesChatPrivados.add(
                    MensajeChatPrivado(
                      id: DateTime.now().microsecondsSinceEpoch.toString(),
                      categoriaServicio: categoria,
                      barrioOTB: otbActualGeo.nombre,
                      autorEmail: usuarioGmail ?? 'invitado@gmail.com',
                      autorRole: rolActual,
                      aliasProtegido: rolActual == RolUsuario.vendedorOtros
                          ? '🛍️ Vendedor de ${categoria.etiqueta}'
                          : '🔒 Compradora OTB (${otbActualGeo.nombre})',
                      texto: texto,
                      timestamp: DateTime.now(),
                    ),
                  );
                });
              },
            ),
        ],
      ),

      bottomNavigationBar: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(30),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.25),
              blurRadius: 16,
              offset: const Offset(0, 6),
            )
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(30),
          child: BottomNavigationBar(
            currentIndex: indicePestanaActual,
            onTap: (index) {
              setState(() => indicePestanaActual = index);
            },
            backgroundColor: Colors.transparent,
            elevation: 0,
            selectedItemColor: const Color(0xFFFF6D00),
            unselectedItemColor: Colors.grey.shade400,
            selectedFontSize: 11,
            unselectedFontSize: 10,
            selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold),
            items: const [
              BottomNavigationBarItem(
                icon: Icon(Icons.map),
                label: '1. Pedidos & Mapa',
              ),
              BottomNavigationBarItem(
                icon: Icon(Icons.delivery_dining),
                label: '2. Recorridos & Otros Pedidos',
              ),
              BottomNavigationBarItem(
                icon: Icon(Icons.forum),
                label: '3. Chat & Foro Barrial (Estilo Reddit)',
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _mostrarDetalleCamionLive() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.local_shipping, size: 36, color: Color(0xFFD84315)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('🚚 Camión de Gas GLP (En Vivo)', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        Text('Chofer: $distribuidorNombre (CI: $distribuidorCI)', style: TextStyle(color: Colors.grey.shade700)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: (pasoSimulacion % 4 == 0) ? Colors.green.shade900.withOpacity(0.3) : Colors.amber.shade900.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: (pasoSimulacion % 4 == 0) ? Colors.greenAccent : Colors.amberAccent,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      (pasoSimulacion % 4 == 0) ? Icons.pause_circle_filled : Icons.directions_bus,
                      color: (pasoSimulacion % 4 == 0) ? Colors.greenAccent : Colors.amberAccent,
                      size: 24,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            (pasoSimulacion % 4 == 0)
                                ? '🅿️ ESTADO REAL GPS: CAMIÓN DETENIDO (0 km/h)'
                                : '🚛 ESTADO REAL GPS: CAMIÓN EN MOVIMIENTO (15 km/h)',
                            style: TextStyle(
                              color: (pasoSimulacion % 4 == 0) ? Colors.greenAccent : Colors.amberAccent,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            (pasoSimulacion % 4 == 0)
                                ? 'El camionero está detenido vendiendo en la calle. Precisión GPS: 15 metros.'
                                : 'El camión está circulando. Sin paradas fijas (se detiene a requerimiento del vecino).',
                            style: const TextStyle(color: Colors.white70, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ──────────────────────────────────────────────
  // MENÚ DE PEDIDOS (Incluye Botón "Otros Pedidos / Encargos")
  // ──────────────────────────────────────────────
  void _abrirMenu1RealizarPedidoModal({LatLng? puntoInicial}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Icon(Icons.shopping_cart, color: Color(0xFFE65100), size: 28),
                    SizedBox(width: 10),
                    Text(
                      'Realizar Pedido o Encargo',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFFE65100)),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                const Text(
                  'Selecciona el producto o encargo especial para tu domicilio:',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const Divider(height: 20),

                // 1. Gas GLP
                ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFFFFE0B2),
                    child: GarrafaIcon(size: 26),
                  ),
                  title: const Text('🛒 Garrafa de Gas GLP', style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: const Text('Muestra tu garrafa en el mapa para el camionero'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _abrirHojaDetallePedido(CategoriaPedido.gas, puntoInicial: puntoInicial);
                  },
                ),

                // 2. Chatarra y Papel
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.green.shade100,
                    child: const Icon(Icons.recycling, color: Color(0xFF388E3C)),
                  ),
                  title: const Text('♻️ Recojo de Chatarra y Papel', style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: const Text('Alerta al camión recabador de cartón y metales'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _abrirHojaDetallePedido(CategoriaPedido.chatarra, puntoInicial: puntoInicial);
                  },
                ),

                // 3. Detergentes Líquidos
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.purple.shade100,
                    child: const Icon(Icons.cleaning_services, color: Color(0xFF7B1FA2)),
                  ),
                  title: const Text('🧴 Detergentes Líquidos a Granel', style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: const Text('Solicita camión vendedor de lavavajillas y suavizante'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _abrirHojaDetallePedido(CategoriaPedido.detergentes, puntoInicial: puntoInicial);
                  },
                ),

                // 4. Agua Botellón 20L
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.blue.shade100,
                    child: const Icon(Icons.water_drop, color: Color(0xFF0288D1)),
                  ),
                  title: const Text('💧 Agua en Botellón 20L', style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: const Text('Avisa al camión repartidor de agua de mesa'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _abrirHojaDetallePedido(CategoriaPedido.agua, puntoInicial: puntoInicial);
                  },
                ),

                // 5. Frutas y Verduras
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.orange.shade100,
                    child: const Icon(Icons.apple, color: Color(0xFFF57C00)),
                  ),
                  title: const Text('🍎 Frutas Frescas y Verduras', style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: const Text('Avisa a vendedores de frutas y verduras'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _abrirHojaDetallePedido(CategoriaPedido.frutas, puntoInicial: puntoInicial);
                  },
                ),

                // 6. OTROS PEDIDOS / ENCARGOS ESPECIALES
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.grey.shade300,
                    child: const Icon(Icons.edit_note, color: Color(0xFF616161)),
                  ),
                  title: const Text('📝 OTROS PEDIDOS / ENCARGOS', style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: const Text('Solicita cualquier otro producto o encargo especial a domicilio'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _abrirHojaDetallePedido(CategoriaPedido.otras, puntoInicial: puntoInicial);
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _abrirCrearAvisoModal() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => HojaCrearAviso(
        userEmail: usuarioGmail ?? 'vecino@gmail.com',
        ciudadActual: ciudadActual.nombre,
        otbActual: otbActualGeo.nombre,
        alCrear: (nuevoAviso) => setState(() => publicaciones.add(nuevoAviso)),
      ),
    );
  }

  void _abrirMenuChoferModal() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: CircleAvatar(
                  backgroundColor: transmitiendoGPSCamion ? Colors.green.shade100 : Colors.red.shade100,
                  child: Icon(transmitiendoGPSCamion ? Icons.gps_fixed : Icons.gps_off, color: transmitiendoGPSCamion ? Colors.green : Colors.red),
                ),
                title: Text(transmitiendoGPSCamion ? '⏹ Detener Transmisión GPS en Vivo' : '🔴 Activar Transmisión GPS en Vivo', style: const TextStyle(fontWeight: FontWeight.bold)),
                onTap: () {
                  setState(() => transmitiendoGPSCamion = !transmitiendoGPSCamion);
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(transmitiendoGPSCamion ? '📡 Transmisión GPS en Vivo ACTIVADA.' : '⏹ Transmisión GPS DETENIDA.'),
                      backgroundColor: transmitiendoGPSCamion ? Colors.green.shade700 : Colors.red.shade900,
                    ),
                  );
                },
              ),
              ListTile(
                leading: CircleAvatar(
                  backgroundColor: garrafasAgotadasGlobal ? Colors.green.shade100 : Colors.red.shade100,
                  child: Icon(garrafasAgotadasGlobal ? Icons.check_circle : Icons.do_not_disturb_on, color: garrafasAgotadasGlobal ? Colors.green : Colors.red),
                ),
                title: Text(garrafasAgotadasGlobal ? '🟢 Notificar Garrafas Disponibles' : '⚠️ AVISAR QUE SE ACABARON GARRAFAS', style: const TextStyle(fontWeight: FontWeight.bold)),
                onTap: () {
                  Navigator.pop(ctx);
                  _toggleGarrafasAgotadas();
                },
              ),
              ListTile(
                leading: const CircleAvatar(backgroundColor: Color(0xFFFFE0B2), child: Icon(Icons.wb_incandescent, color: Color(0xFFE65100))),
                title: const Text('✨ Avisar Barrio e Iluminar Mapa', style: TextStyle(fontWeight: FontWeight.bold)),
                onTap: () {
                  Navigator.pop(ctx);
                  _abrirModalAnunciarBarrioEIluminarMapa();
                },
              ),
              ListTile(
                leading: CircleAvatar(backgroundColor: Colors.purple.shade100, child: Icon(grabandoRutaGPS ? Icons.stop : Icons.fiber_manual_record, color: Colors.purple.shade900)),
                title: Text(grabandoRutaGPS ? '⏹ Detener y Guardar Ruta GPS' : '🔴 Grabar Ruta GPS Recurrente', style: const TextStyle(fontWeight: FontWeight.bold)),
                onTap: () {
                  Navigator.pop(ctx);
                  _alternarGrabacionRutaGPS();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _dispararAlertaEsperaTeSigo() {
    final puntoVecino = LatLng(
      ubicacionCamionLive.latitude - 0.0003,
      ubicacionCamionLive.longitude - 0.0002,
    );

    final nuevaAlertaUrgente = PublicacionItem(
      id: 'alerta-sigo-${DateTime.now().microsecondsSinceEpoch}',
      tipo: TipoPublicacion.pedido,
      categoria: CategoriaPedido.gas,
      titulo: '🚨 ¡ESPERA! TE ESTOY SIGUIENDO',
      descripcion: '¡Vecino persiguiendo el camión a 35 metros! Por favor espere unos segundos.',
      ciudad: ciudadActual.nombre,
      barrioOTB: otbActualGeo.nombre,
      userEmail: usuarioGmail ?? 'vecino.corriendo@gmail.com',
      userRole: RolUsuario.cliente,
      point: puntoVecino,
      createdAt: DateTime.now(),
    );

    setState(() {
      publicaciones.add(nuevaAlertaUrgente);
    });
    _subirPublicacionSupabase(nuevaAlertaUrgente);

    mapController.move(puntoVecino, 16.0);

    // Auto-expiración de la alerta de persecución en 3 minutos
    Timer(const Duration(minutes: 3), () {
      if (mounted) {
        setState(() {
          publicaciones.removeWhere((p) => p.id == nuevaAlertaUrgente.id);
        });
      }
    });

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Row(
          children: [
            Icon(Icons.flash_on, color: Color(0xFFFF1744), size: 28),
            SizedBox(width: 8),
            Text('🚨 UN SOLO BIP & PARPADEO LED ROJO', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
          ],
        ),
        content: const Text(
          '🔊 ¡1 solo BIP discreto emitido!\n\nSe enciende el destello LED en rojo en los bordes de la pantalla del camionero. Sin ruidos repetitivos ni molestos.',
          style: TextStyle(color: Colors.white70, fontSize: 13, height: 1.4),
        ),
        actions: [
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF1744)),
            onPressed: () => Navigator.pop(ctx),
            child: const Text('¡ENTENDIDO! VOY CORRIENDO'),
          ),
        ],
      ),
    );
  }

  void _banearUsuario(String email) {
    if (!usuariosBaneados.contains(email)) {
      setState(() {
        usuariosBaneados.add(email);
        publicaciones.removeWhere((p) => p.userEmail == email);
        mensajesChatPrivados.removeWhere((m) => m.autorEmail == email);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('🚫 Usuario $email ha sido BANEADO permanentemente de la aplicación.'),
          backgroundColor: Colors.red.shade900,
        ),
      );
    }
  }

  void _desbloquearPanelAdminModal() {
    final gmailCtrl = TextEditingController(text: usuarioGmail ?? '');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Row(
          children: [
            Icon(Icons.admin_panel_settings, color: Colors.amber),
            SizedBox(width: 8),
            Text('Modo Administrador', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Ingresa tu correo electrónico autorizado para acceder al panel de control:', style: TextStyle(color: Colors.white70, fontSize: 12)),
            const SizedBox(height: 12),
            TextField(
              controller: gmailCtrl,
              keyboardType: TextInputType.emailAddress,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'Correo de Administrador',
                labelStyle: const TextStyle(color: Colors.grey),
                hintText: 'ejemplo@dominio.com',
                hintStyle: const TextStyle(color: Colors.white30),
                filled: true,
                fillColor: const Color(0xFF0F172A),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar', style: TextStyle(color: Colors.grey))),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.amber.shade800),
            onPressed: () {
              final emailIngresado = gmailCtrl.text.trim().toLowerCase();
              if (correosAdministradores.contains(emailIngresado) || emailIngresado == 'erikmartinelly@gmail.com') {
                if (!correosAdministradores.contains(emailIngresado)) {
                  correosAdministradores.add(emailIngresado);
                }
                setState(() {
                  usuarioGmail = emailIngresado;
                  rolActual = RolUsuario.administrador;
                });
                Navigator.pop(ctx);
                _abrirPanelControlAdministrador();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('⚡ Modo Administrador activado.'), backgroundColor: Colors.amber),
                );
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('❌ El correo ingresado no está registrado como Administrador.'), backgroundColor: Colors.red),
                );
              }
            },
            child: const Text('🔑 ENTRAR COMO ADMIN'),
          ),
        ],
      ),
    );
  }

  void _abrirPanelControlAdministrador() {
    final anuncioCtrl = TextEditingController();
    final usuarioBanCtrl = TextEditingController();
    final nuevoAdminCtrl = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => SafeArea(
          child: Container(
            height: MediaQuery.of(context).size.height * 0.88,
            color: const Color(0xFF0F172A),
            padding: const EdgeInsets.all(20),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(color: Colors.amber.shade800, shape: BoxShape.circle),
                        child: const Icon(Icons.admin_panel_settings, color: Colors.white, size: 24),
                      ),
                      const SizedBox(width: 10),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Panel de Control Administrador', style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                          Text('Supervisión de Sistema Autorizado', style: TextStyle(color: Colors.amber, fontSize: 11, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ],
                  ),
                  const Divider(color: Colors.white24, height: 24),

                  // SECCIÓN 1: PUBLICAR ANUNCIO OFICIAL
                  const Text('📢 1. Publicar Anuncio Oficial del Sistema', style: TextStyle(color: Colors.amber, fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: anuncioCtrl,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: InputDecoration(
                      labelText: 'Texto del Anuncio Oficial...',
                      labelStyle: const TextStyle(color: Colors.grey),
                      filled: true,
                      fillColor: const Color(0xFF1E293B),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: Colors.amber.shade800),
                      onPressed: () {
                        if (anuncioCtrl.text.trim().isNotEmpty) {
                          setState(() {
                            publicaciones.add(
                              PublicacionItem(
                                id: DateTime.now().microsecondsSinceEpoch.toString(),
                                tipo: TipoPublicacion.avisoBarrio,
                                categoria: CategoriaPedido.gas,
                                titulo: '📢 ANUNCIO OFICIAL: ${anuncioCtrl.text.trim()}',
                                descripcion: 'Publicado por la Administración del Sistema NOTIGAS.',
                                ciudad: ciudadActual.nombre,
                                barrioOTB: otbActualGeo.nombre,
                                userEmail: usuarioGmail ?? 'erikmartinelly@gmail.com',
                                userRole: RolUsuario.administrador,
                                point: otbActualGeo.punto,
                                createdAt: DateTime.now(),
                              ),
                            );
                          });
                          anuncioCtrl.clear();
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('¡Anuncio Oficial publicado en la OTB!'), backgroundColor: Colors.green),
                          );
                        }
                      },
                      icon: const Icon(Icons.campaign),
                      label: const Text('Publicar Anuncio Oficial'),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // SECCIÓN 2: CONTROL Y BANEO DE USUARIOS
                  const Text('👥 2. Control & Baneo de Usuarios', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: usuarioBanCtrl,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: InputDecoration(
                      labelText: 'Email de Usuario a Banear (Ej. usuario@spam.com)',
                      labelStyle: const TextStyle(color: Colors.grey),
                      filled: true,
                      fillColor: const Color(0xFF1E293B),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: Colors.red.shade900),
                      onPressed: () {
                        if (usuarioBanCtrl.text.trim().isNotEmpty) {
                          _banearUsuario(usuarioBanCtrl.text.trim().toLowerCase());
                          usuarioBanCtrl.clear();
                        }
                      },
                      icon: const Icon(Icons.gavel),
                      label: const Text('🚫 BANEAR USUARIO PERMANENTEMENTE'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text('Usuarios Baneados Actualmente: ${usuariosBaneados.length}', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                  if (usuariosBaneados.isNotEmpty)
                    ...usuariosBaneados.map(
                      (u) => ListTile(
                        dense: true,
                        leading: const Icon(Icons.block, color: Colors.red, size: 16),
                        title: Text(u, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                        trailing: IconButton(
                          icon: const Icon(Icons.undo, color: Colors.green, size: 18),
                          onPressed: () {
                            setModalState(() {
                              setState(() => usuariosBaneados.remove(u));
                            });
                          },
                        ),
                      ),
                    ),
                  const SizedBox(height: 20),

                  // SECCIÓN 3: GESTIÓN DE ADMINISTRADORES ADICIONALES
                  const Text('🔑 3. Habilitar Administradores Adicionales', style: TextStyle(color: Colors.cyanAccent, fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: nuevoAdminCtrl,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: InputDecoration(
                      labelText: 'Nuevo Gmail de Administrador (Ej. aux.admin@gmail.com)',
                      labelStyle: const TextStyle(color: Colors.grey),
                      filled: true,
                      fillColor: const Color(0xFF1E293B),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: Colors.teal.shade700),
                      onPressed: () {
                        final emailNuevo = nuevoAdminCtrl.text.trim().toLowerCase();
                        if (emailNuevo.isNotEmpty && emailNuevo.contains('@gmail.com')) {
                          setModalState(() {
                            if (!correosAdministradores.contains(emailNuevo)) {
                              correosAdministradores.add(emailNuevo);
                            }
                          });
                          nuevoAdminCtrl.clear();
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('¡Correo $emailNuevo habilitado como Administrador!'), backgroundColor: Colors.teal),
                          );
                        }
                      },
                      icon: const Icon(Icons.person_add),
                      label: const Text('➕ Habilitar como Administrador'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text('Administradores Autorizados (${correosAdministradores.length}):', style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                  ...correosAdministradores.map(
                    (adminEmail) => ListTile(
                      dense: true,
                      leading: const Icon(Icons.verified_user, color: Colors.cyanAccent, size: 18),
                      title: Text(adminEmail, style: const TextStyle(color: Colors.white, fontSize: 12)),
                      trailing: adminEmail == 'erikmartinelly@gmail.com'
                          ? const Text('Principal', style: TextStyle(color: Colors.amber, fontSize: 10, fontWeight: FontWeight.bold))
                          : IconButton(
                              icon: const Icon(Icons.delete_forever, color: Colors.redAccent, size: 18),
                              onPressed: () {
                                setModalState(() {
                                  correosAdministradores.remove(adminEmail);
                                });
                              },
                            ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // SECCIÓN 4: GESTIONAR ESPACIO DE ANUNCIO NATIVO MIMETIZADO
                  const Text('🎨 4. Gestionar Anuncio Nativo Mimetizado', style: TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 8),
                  StatefulBuilder(
                    builder: (ctx, setAdState) {
                      final editTextoCtrl = TextEditingController(text: textoAnuncioNativoSistema);
                      final editUrlCtrl = TextEditingController(text: urlAnuncioNativoSistema ?? '');

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          TextField(
                            controller: editTextoCtrl,
                            style: const TextStyle(color: Colors.white, fontSize: 13),
                            decoration: InputDecoration(
                              labelText: 'Texto del Anuncio Nativo (Línea Mimetizada)',
                              labelStyle: const TextStyle(color: Colors.grey),
                              filled: true,
                              fillColor: const Color(0xFF1E293B),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: editUrlCtrl,
                            style: const TextStyle(color: Colors.white, fontSize: 13),
                            decoration: InputDecoration(
                              labelText: 'Enlace WhatsApp / Web al Tocar (Opcional)',
                              labelStyle: const TextStyle(color: Colors.grey),
                              filled: true,
                              fillColor: const Color(0xFF1E293B),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                          ),
                          const SizedBox(height: 8),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                              style: FilledButton.styleFrom(backgroundColor: Colors.amber.shade900),
                              onPressed: () {
                                if (editTextoCtrl.text.trim().isNotEmpty) {
                                  setState(() {
                                    textoAnuncioNativoSistema = editTextoCtrl.text.trim();
                                    urlAnuncioNativoSistema = editUrlCtrl.text.trim().isEmpty ? null : editUrlCtrl.text.trim();
                                  });
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('✨ ¡Anuncio Nativo Mimetizado actualizado!'), backgroundColor: Colors.amber),
                                  );
                                }
                              },
                              icon: const Icon(Icons.style),
                              label: const Text('✨ Actualizar Anuncio Nativo'),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _abrirModalAnunciarVendedorOtros() {
    final tituloCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final ofertaCtrl = TextEditingController();
    final horarioCtrl = TextEditingController(text: '09:00 - 13:00');
    CategoriaPedido categoriaSelec = CategoriaPedido.frutas;
    bool esOferta = false;
    final List<OTBGeo> barriosSelec = [];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => SafeArea(
          child: Container(
            height: MediaQuery.of(context).size.height * 0.85,
            padding: const EdgeInsets.all(20),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: const [
                      Icon(Icons.storefront, color: Color(0xFF0288D1), size: 28),
                      SizedBox(width: 10),
                      Text('Anunciar Recorrido / Oferta Vendedor', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<CategoriaPedido>(
                    value: categoriaSelec,
                    decoration: const InputDecoration(labelText: 'Categoría de Servicio', border: OutlineInputBorder()),
                    items: CategoriaPedido.values
                        .where((c) => c != CategoriaPedido.gas)
                        .map((c) => DropdownMenuItem(value: c, child: Text(c.etiqueta)))
                        .toList(),
                    onChanged: (val) => setModalState(() => categoriaSelec = val!),
                  ),
                  const SizedBox(height: 10),
                  TextField(controller: tituloCtrl, decoration: const InputDecoration(labelText: 'Título del Anuncio (Ej. Venta de Frutas del Campo)', border: OutlineInputBorder())),
                  const SizedBox(height: 10),
                  TextField(controller: descCtrl, maxLines: 2, decoration: const InputDecoration(labelText: 'Descripción de Productos', border: OutlineInputBorder())),
                  const SizedBox(height: 10),
                  TextField(controller: horarioCtrl, decoration: const InputDecoration(labelText: 'Horario del Recorrido', border: OutlineInputBorder())),
                  const SizedBox(height: 10),
                  CheckboxListTile(
                    title: const Text('🏷️ ¿Incluye Promoción u Oferta Especial?', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    value: esOferta,
                    activeColor: const Color(0xFFFF6D00),
                    onChanged: (v) => setModalState(() => esOferta = v ?? false),
                  ),
                  if (esOferta) ...[
                    TextField(controller: ofertaCtrl, decoration: const InputDecoration(labelText: 'Detalle de la Oferta (Ej. 2x1 en Manzanas o 10% Descuento)', border: OutlineInputBorder())),
                    const SizedBox(height: 10),
                  ],
                  const Text('Seleccionar Barrios a Recorrer Hoy:', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  ...ciudadActual.otbs.map((otb) {
                    final sel = barriosSelec.contains(otb);
                    return CheckboxListTile(
                      dense: true,
                      title: Text(otb.nombre),
                      value: sel,
                      activeColor: const Color(0xFF0288D1),
                      onChanged: (v) {
                        setModalState(() {
                          if (v == true) {
                            barriosSelec.add(otb);
                          } else {
                            barriosSelec.remove(otb);
                          }
                        });
                      },
                    );
                  }),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: const Color(0xFF0288D1)),
                      onPressed: () {
                        if (barriosSelec.isEmpty || tituloCtrl.text.trim().isEmpty) return;
                        setState(() {
                          for (var otb in barriosSelec) {
                            final nuevaPub = PublicacionItem(
                              id: DateTime.now().microsecondsSinceEpoch.toString(),
                              tipo: TipoPublicacion.avisoBarrio,
                              categoria: categoriaSelec,
                              titulo: esOferta ? '🏷️ PROMOCIÓN: ${tituloCtrl.text.trim()}' : '🚚 RECORRIDO: ${tituloCtrl.text.trim()}',
                              descripcion: '${descCtrl.text.trim()}\n⏰ Horario: ${horarioCtrl.text.trim()}',
                              ciudad: ciudadActual.nombre,
                              barrioOTB: otb.nombre,
                              userEmail: usuarioGmail ?? 'vendedor@notigas.app',
                              userRole: RolUsuario.vendedorOtros,
                              point: otb.punto,
                              createdAt: DateTime.now(),
                              esPromocion: esOferta,
                              ofertaTexto: esOferta ? ofertaCtrl.text.trim() : null,
                            );
                            publicaciones.add(nuevaPub);
                            _subirPublicacionSupabase(nuevaPub);
                          }
                        });
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('¡Anuncio de ${categoriaSelec.etiqueta} publicado en ${barriosSelec.length} barrios!'), backgroundColor: Colors.green.shade700),
                        );
                      },
                      icon: const Icon(Icons.campaign),
                      label: const Text('📢 Publicar Anuncio & Oferta en Barrios'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _abrirHojaDetallePedido(CategoriaPedido cat, {LatLng? puntoInicial}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => HojaCrearPedido(
        categoriaInicial: cat,
        puntoInicial: puntoInicial ?? ciudadActual.punto,
        ciudadActual: ciudadActual.nombre,
        otbActual: otbActualGeo.nombre,
        userEmail: usuarioGmail ?? 'vecino@gmail.com',
        userRole: rolActual,
        alCrear: (nuevoItem, abrirChatOpcional) {
          setState(() => publicaciones.add(nuevoItem));
          mapController.move(nuevoItem.point, 14.5);

          if (abrirChatOpcional && nuevoItem.categoria != CategoriaPedido.gas) {
            setState(() => indicePestanaActual = 2);
          }

          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('¡Pedido de ${nuevoItem.categoria.etiqueta} publicado!'),
              backgroundColor: Colors.green.shade700,
            ),
          );
        },
      ),
    );
  }

  void _toggleGarrafasAgotadas() {
    setState(() {
      garrafasAgotadasGlobal = !garrafasAgotadasGlobal;
      for (var p in publicaciones) {
        if (p.tipo == TipoPublicacion.rutaDistribuidor) {
          p.garrafasAgotadas = garrafasAgotadasGlobal;
        }
      }
    });

    final estadoTexto = garrafasAgotadasGlobal
        ? '⚠️ ATENCIÓN: El camión de GLP ha notificado que SE AGOTARON LAS GARRAFAS.'
        : '🟢 El camión vuelve a tener garrafas disponibles.';

    publicaciones.add(
      PublicacionItem(
        id: DateTime.now().microsecondsSinceEpoch.toString(),
        tipo: TipoPublicacion.avisoBarrio,
        categoria: CategoriaPedido.gas,
        titulo: garrafasAgotadasGlobal ? '⚠️ GARRAFAS AGOTADAS EN CAMIÓN' : '🟢 GARRAFAS DISPONIBLES EN CAMIÓN',
        descripcion: estadoTexto,
        ciudad: ciudadActual.nombre,
        barrioOTB: otbActualGeo.nombre,
        userEmail: usuarioGmail ?? 'distribuidor@notigas.app',
        userRole: RolUsuario.distribuidor,
        distribuidorNombre: distribuidorNombre,
        distribuidorCI: distribuidorCI,
        point: otbActualGeo.punto,
        createdAt: DateTime.now(),
      ),
    );

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(estadoTexto),
        backgroundColor: garrafasAgotadasGlobal ? Colors.red.shade900 : Colors.green.shade700,
      ),
    );
  }

  void _abrirModalAnunciarBarrioEIluminarMapa() {
    final List<OTBGeo> seleccionados = [];
    final horarioCtrl = TextEditingController(text: '08:30 - 12:00');

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => SafeArea(
          child: Container(
            height: MediaQuery.of(context).size.height * 0.75,
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Icon(Icons.wb_incandescent, color: Color(0xFFE65100), size: 30),
                    SizedBox(width: 10),
                    Text('Anunciar Barrio e Iluminar Mapa', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 6),
                const Text('Selecciona los barrios a los que te dirijes hoy. El mapa se iluminará en tono naranja para los vecinos.'),
                const SizedBox(height: 12),
                TextField(
                  controller: horarioCtrl,
                  decoration: const InputDecoration(labelText: 'Horario Aproximado de Llegada', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 14),
                const Text('Seleccionar Barrios a Iluminar:', style: TextStyle(fontWeight: FontWeight.bold)),
                Expanded(
                  child: ListView(
                    children: ciudadActual.otbs.map((otb) {
                      final estaSelec = seleccionados.contains(otb);
                      return CheckboxListTile(
                        title: Text(otb.nombre),
                        value: estaSelec,
                        activeColor: const Color(0xFFE65100),
                        onChanged: (val) {
                          setModalState(() {
                            if (val == true) {
                              seleccionados.add(otb);
                            } else {
                              seleccionados.remove(otb);
                            }
                          });
                        },
                      );
                    }).toList(),
                  ),
                ),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: const Color(0xFFE65100)),
                    onPressed: () {
                      if (seleccionados.isEmpty) return;
                      setState(() {
                        otbsIluminadas = List.from(seleccionados);
                        otbActualGeo = seleccionados.first;
                        publicaciones.add(
                          PublicacionItem(
                            id: DateTime.now().microsecondsSinceEpoch.toString(),
                            tipo: TipoPublicacion.rutaDistribuidor,
                            categoria: CategoriaPedido.gas,
                            titulo: '🚚 CAMIÓN DE GLP: ${seleccionados.map((s) => s.nombre).join(', ')}',
                            descripcion: 'Atención vecinos. El camión del chofer $distribuidorNombre recorre su zona.',
                            ciudad: ciudadActual.nombre,
                            barrioOTB: seleccionados.first.nombre,
                            userEmail: usuarioGmail ?? 'distribuidor@notigas.app',
                            userRole: RolUsuario.distribuidor,
                            distribuidorNombre: distribuidorNombre,
                            distribuidorCI: distribuidorCI,
                            horarioRecorrido: horarioCtrl.text,
                            point: seleccionados.first.punto,
                            createdAt: DateTime.now(),
                          ),
                        );
                      });
                      Navigator.pop(ctx);
                      mapController.move(seleccionados.first.punto, 14.5);
                    },
                    icon: const Icon(Icons.wb_sunny),
                    label: const Text('✨ Publicar e Iluminar Barrios'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _alternarGrabacionRutaGPS() {
    if (!grabandoRutaGPS) {
      setState(() {
        grabandoRutaGPS = true;
        coordenadasGrabadasEnVivo.clear();
        coordenadasGrabadasEnVivo.add(ciudadActual.punto);
      });
    } else {
      setState(() => grabandoRutaGPS = false);
      if (coordenadasGrabadasEnVivo.isNotEmpty) {
        _mostrarDialogoGuardarRuta(coordenadasGrabadasEnVivo);
      }
    }
  }

  void _mostrarDialogoGuardarRuta(List<LatLng> puntos) {
    final nombreRutaCtrl = TextEditingController(text: 'Ruta de Recorrido GLP');
    final horarioCtrl = TextEditingController(text: '08:30 - 12:00');
    String diaSeleccionado = 'Lunes';

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Guardar Ruta Recurrente'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nombreRutaCtrl, decoration: const InputDecoration(labelText: 'Nombre de la Ruta')),
            TextField(controller: horarioCtrl, decoration: const InputDecoration(labelText: 'Horario')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () {
              final nuevaRuta = RutaSemanalGuardada(
                id: DateTime.now().microsecondsSinceEpoch.toString(),
                diaSemana: diaSeleccionado,
                nombreRuta: nombreRutaCtrl.text.trim(),
                barrioOTB: otbActualGeo.nombre,
                horarioAproximado: horarioCtrl.text.trim(),
                puntosCoordenadas: List.from(puntos),
              );
              setState(() {
                publicaciones.add(
                  PublicacionItem(
                    id: nuevaRuta.id,
                    tipo: TipoPublicacion.rutaDistribuidor,
                    categoria: CategoriaPedido.gas,
                    titulo: '🚚 RUTA DE $diaSeleccionado: ${nuevaRuta.nombreRuta}',
                    descripcion: 'Recorrido oficial de distribución.',
                    ciudad: ciudadActual.nombre,
                    barrioOTB: otbActualGeo.nombre,
                    userEmail: usuarioGmail ?? 'distribuidor@notigas.app',
                    userRole: RolUsuario.distribuidor,
                    distribuidorNombre: distribuidorNombre,
                    distribuidorCI: distribuidorCI,
                    horarioRecorrido: nuevaRuta.horarioAproximado,
                    puntosTrazoRuta: nuevaRuta.puntosCoordenadas,
                    point: nuevaRuta.puntosCoordenadas.first,
                    createdAt: DateTime.now(),
                  ),
                );
              });
              Navigator.pop(ctx);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  void _mostrarModalSeleccionModalidadInicial() {
    showModalBottomSheet(
      context: context,
      isDismissible: false,
      enableDrag: false,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                '¿Eres Vendedor o Comprador?',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFFE65100)),
              ),
              const SizedBox(height: 8),
              const Text(
                'Selecciona tu perfil para ingresar a la aplicación:',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 20),
              // BOTÓN 1: DISTRIBUIDOR
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFD84315),
                    foregroundColor: Colors.white,
                    elevation: 4,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  onPressed: () {
                    setState(() {
                      rolInicialConfirmado = true;
                    });
                    Navigator.pop(ctx);
                    _mostrarModalVerificacionDistribuidorWhatsApp();
                  },
                  icon: const Icon(Icons.local_shipping, size: 24),
                  label: const Text(
                    '🚚 DISTRIBUIDOR',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 0.8),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              // BOTÓN 2: COMPRADOR
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE65100),
                    foregroundColor: Colors.white,
                    elevation: 4,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  onPressed: () {
                    setState(() {
                      rolActual = RolUsuario.cliente;
                      rolInicialConfirmado = true;
                    });
                    Navigator.pop(ctx);
                    _solicitarActivarGPSComprador();
                  },
                  icon: const Icon(Icons.shopping_cart, size: 24),
                  label: const Text(
                    '🛒 COMPRADOR',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 0.8),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _solicitarActivarGPSComprador() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('⚠️ Por favor activa el GPS de tu celular para ubicarte automáticamente.'),
              backgroundColor: Colors.amber,
              duration: Duration(seconds: 4),
            ),
          );
        }
        await Geolocator.openLocationSettings();
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('❌ Permiso de localización denegado.'),
                backgroundColor: Colors.red,
              ),
            );
          }
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('❌ Permiso GPS denegado permanentemente en ajustes del celular.'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );

      final realPoint = LatLng(position.latitude, position.longitude);

      if (mounted) {
        setState(() {
          mapController.move(realPoint, 16.5);
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('📍 Ubicación GPS detectada automáticamente (${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)}).'),
            backgroundColor: const Color(0xFF388E3C),
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      debugPrint('Error obteniendo ubicación GPS hardware: $e');
    }
  }

  void _mostrarModalAjustesConfiguracion() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: const [
                  Icon(Icons.settings, color: Color(0xFFE65100), size: 24),
                  SizedBox(width: 10),
                  Text('⚙️ Ajustes & Configuración', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
              const Divider(height: 24),

              ListTile(
                leading: const Icon(Icons.switch_account, color: Color(0xFF0288D1)),
                title: const Text('¿Eres Vendedor o Comprador?'),
                subtitle: Text(rolActual == RolUsuario.distribuidor
                    ? 'Chofer GLP'
                    : (rolActual == RolUsuario.vendedorOtros ? 'Vendedor de Productos' : 'Comprador')),
                onTap: () {
                  Navigator.pop(ctx);
                  _mostrarModalSeleccionModalidadInicial();
                },
              ),

              ListTile(
                leading: const Icon(Icons.gps_fixed, color: Colors.green),
                title: const Text('Ubicación GPS Automática'),
                subtitle: const Text('Centrar mapa según el GPS de tu celular'),
                onTap: () {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('📍 Mapa centrado en tu posición GPS actual.')),
                  );
                },
              ),

              ListTile(
                leading: const Icon(Icons.map, color: Colors.deepOrange),
                title: const Text('Estilo de Mapa HD'),
                subtitle: Text(estiloMapaActual.nombre),
                onTap: () {
                  Navigator.pop(ctx);
                  _mostrarSelectorEstiloMapaModal();
                },
              ),

              const Divider(height: 16),

              // ACCESO DISCRETO ADMINISTRADOR (SIN EXPONER GMAIL)
              ListTile(
                leading: const Icon(Icons.lock, color: Colors.amber),
                title: const Text('Modo Administrador'),
                subtitle: const Text('Ingreso discreto para moderadores autorizados'),
                onTap: () {
                  Navigator.pop(ctx);
                  _desbloquearPanelAdminModal();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _mostrarSelectorEstiloMapaModal() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        children: EstiloMapaHD.values.map((estilo) {
          return ListTile(
            leading: Icon(estilo.icono, color: const Color(0xFFE65100)),
            title: Text(estilo.nombre),
            selected: estiloMapaActual == estilo,
            onTap: () {
              setState(() => estiloMapaActual = estilo);
              Navigator.pop(ctx);
            },
          );
        }).toList(),
      ),
    );
  }

  void _mostrarModalCancelarPedidoActivo() {
    String motivoSeleccionado = 'Ya compré en otro lugar (camión de la esquina)';

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (dialogCtx, setModalState) => AlertDialog(
          title: const Text('❌ Cancelar Pedido de Gas', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFB71C1C))),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Selecciona el motivo de la cancelación para informar al sistema:'),
              const SizedBox(height: 12),
              RadioListTile<String>(
                title: const Text('Ya compré en otro lugar (camión de la esquina)', style: TextStyle(fontSize: 12)),
                value: 'Ya compré en otro lugar (camión de la esquina)',
                groupValue: motivoSeleccionado,
                onChanged: (val) => setModalState(() => motivoSeleccionado = val!),
              ),
              RadioListTile<String>(
                title: const Text('El camión tardó mucho / no pasó', style: TextStyle(fontSize: 12)),
                value: 'El camión tardó mucho / no pasó',
                groupValue: motivoSeleccionado,
                onChanged: (val) => setModalState(() => motivoSeleccionado = val!),
              ),
              RadioListTile<String>(
                title: const Text('Me equivoqué de dirección u OTB', style: TextStyle(fontSize: 12)),
                value: 'Me equivoqué de dirección u OTB',
                groupValue: motivoSeleccionado,
                onChanged: (val) => setModalState(() => motivoSeleccionado = val!),
              ),
              RadioListTile<String>(
                title: const Text('Ya no necesito gas hoy', style: TextStyle(fontSize: 12)),
                value: 'Ya no necesito gas hoy',
                groupValue: motivoSeleccionado,
                onChanged: (val) => setModalState(() => motivoSeleccionado = val!),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Volver')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB71C1C)),
              onPressed: () {
                setState(() {
                  publicaciones.removeWhere((p) => p.tipo == TipoPublicacion.pedido);
                });
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('✅ Pedido cancelado ($motivoSeleccionado). Se retiró tu señal del mapa.'),
                    backgroundColor: const Color(0xFF388E3C),
                  ),
                );
              },
              child: const Text('Confirmar Cancelación'),
            ),
          ],
        ),
      ),
    );
  }

  void _mostrarModalVerificacionDistribuidorWhatsApp() {
    final nombreCtrl = TextEditingController(text: distribuidorNombre ?? '');
    final ciCtrl = TextEditingController(text: distribuidorCI ?? '');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Habilitación por WhatsApp'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nombreCtrl, decoration: const InputDecoration(labelText: 'Nombre y Apellidos')),
            TextField(controller: ciCtrl, decoration: const InputDecoration(labelText: 'C.I. (Carnet de Identidad)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Volver')),
          FilledButton(
            onPressed: () {
              if (nombreCtrl.text.trim().length >= 3 && ciCtrl.text.trim().length >= 4) {
                setState(() {
                  distribuidorNombre = nombreCtrl.text.trim();
                  distribuidorCI = ciCtrl.text.trim();
                  rolActual = RolUsuario.distribuidor;
                  indicePestanaActual = 0;
                });
                Navigator.pop(ctx);
              }
            },
            child: const Text('Ingresar Chofer'),
          ),
        ],
      ),
    );
  }

  void _mostrarSelectorUbicacion() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => StatefulBuilder(
        builder: (ctx, setModalState) => SafeArea(
          child: Container(
            height: MediaQuery.of(context).size.height * 0.75,
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('📍 Seleccionar Municipio / OTB', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                DropdownButtonFormField<Ciudad>(
                  initialValue: ciudadActual,
                  isExpanded: true,
                  items: ciudadesBolivia.map((c) => DropdownMenuItem(value: c, child: Text(c.nombre))).toList(),
                  onChanged: (c) {
                    if (c != null) {
                      setModalState(() {
                        ciudadActual = c;
                        otbActualGeo = c.otbs.first;
                        otbsIluminadas = [c.otbs.first];
                      });
                      setState(() {
                        ciudadActual = c;
                        otbActualGeo = c.otbs.first;
                        otbsIluminadas = [c.otbs.first];
                      });
                      mapController.move(c.punto, c.zoom);
                    }
                  },
                ),
                Expanded(
                  child: ListView.builder(
                    itemCount: ciudadActual.otbs.length,
                    itemBuilder: (ctx, i) {
                      final otb = ciudadActual.otbs[i];
                      return ListTile(
                        title: Text(otb.nombre),
                        onTap: () {
                          setState(() {
                            otbActualGeo = otb;
                            otbsIluminadas = [otb];
                          });
                          Navigator.pop(ctx);
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _mostrarDetalleItem(PublicacionItem item) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.titulo, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              Text('${item.ciudad} - ${item.barrioOTB}', style: TextStyle(color: Colors.grey.shade700)),
              const SizedBox(height: 12),
              Text(item.descripcion),
              const SizedBox(height: 16),

              // BOTÓN UNIVERSAL DE ALERTA: ¡ESPERA! TE SIGO
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFF1744),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () {
                    Navigator.pop(context);
                    _dispararAlertaEsperaTeSigo();
                  },
                  icon: const Icon(Icons.directions_run, size: 20),
                  label: const Text('🛑 ¡ESPERA! TE SIGO (Aviso al Chofer)', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(height: 8),

              // BOTÓN DE DESACTIVACIÓN MANUAL: YA COMPRÉ MI GARRAFA / CANCELAR AVISO
              if (item.categoria == CategoriaPedido.gas || item.tipo == TipoPublicacion.pedido) ...[
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFFE65100),
                      side: const BorderSide(color: Color(0xFFE65100), width: 1.2),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: () {
                      setState(() {
                        publicaciones.removeWhere((p) => p.id == item.id);
                      });
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('✅ Aviso de Garrafa Desactivado. Se ha removido tu señal del mapa.'),
                          backgroundColor: Color(0xFF388E3C),
                        ),
                      );
                    },
                    icon: const Icon(Icons.check_circle_outline, size: 20),
                    label: const Text('✅ YA COMPRÉ MI GARRAFA (Desactivar Aviso del Mapa)', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
                const SizedBox(height: 8),
              ],

              // BOTÓN DIRECTO DE WHATSAPP: $0 COSTOS DE BASE DE DATOS
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF25D366),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () {
                    final mensaje = Uri.encodeComponent(
                      'Hola! Vi tu publicación en NOTIGAS (${item.titulo} en ${item.barrioOTB}). Me interesa coordinar contigo.',
                    );
                    final url = 'https://wa.me/59170712345?text=$mensaje';
                    launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
                  },
                  icon: const Icon(Icons.chat, size: 20),
                  label: const Text('💬 CONTACTAR POR WHATSAPP (Directo sin costo)', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Hoja Crear Pedido (Con Opción de Chat Opcional)
// ──────────────────────────────────────────────
class HojaCrearPedido extends StatefulWidget {
  const HojaCrearPedido({
    super.key,
    required this.categoriaInicial,
    required this.puntoInicial,
    required this.ciudadActual,
    required this.otbActual,
    required this.userEmail,
    required this.userRole,
    required this.alCrear,
  });

  final CategoriaPedido categoriaInicial;
  final LatLng puntoInicial;
  final String ciudadActual;
  final String otbActual;
  final String userEmail;
  final RolUsuario userRole;
  final void Function(PublicacionItem, bool) alCrear;

  @override
  State<HojaCrearPedido> createState() => _HojaCrearPedidoState();
}

class _HojaCrearPedidoState extends State<HojaCrearPedido> {
  late CategoriaPedido categoriaSeleccionada;
  final notaCtrl = TextEditingController();
  bool deseaAbrirChatPrivado = false;

  @override
  void initState() {
    super.initState();
    categoriaSeleccionada = widget.categoriaInicial;
  }

  @override
  Widget build(BuildContext context) {
    final esGas = categoriaSeleccionada == CategoriaPedido.gas;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              esGas ? const GarrafaIcon(size: 32) : Icon(categoriaSeleccionada.icono, color: categoriaSeleccionada.color, size: 28),
              const SizedBox(width: 10),
              Text(
                esGas ? '🔔 Emitir Aviso de Garrafa Vacía' : 'Nuevo Pedido: ${categoriaSeleccionada.etiqueta}',
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (esGas)
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.amber.shade900.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.amber, width: 1),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, color: Colors.amber, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '📢 AVISO SIN COMPROMISO: Notifica al chofer que sacaste tu garrafa vacía a la acera/puerta. El camión decidirá si se aproxima según su carga y trayecto disponible.',
                      style: TextStyle(color: Colors.white70, fontSize: 11),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 12),
          TextField(
            controller: notaCtrl,
            decoration: InputDecoration(
              labelText: esGas ? 'Indicación de ubicación (Ej. Garrafa vacía afuera en la puerta)' : 'Detalle o descripción del producto...',
              border: const OutlineInputBorder(),
            ),
          ),
          if (!esGas) ...[
            const SizedBox(height: 10),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('💬 Deseo abrir un Chat Privado opcional con el Vendedor', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              subtitle: const Text('Si no lo marcas, tu pedido solo se mostrará en el mapa', style: TextStyle(fontSize: 11)),
              value: deseaAbrirChatPrivado,
              activeColor: const Color(0xFF0288D1),
              onChanged: (val) => setState(() => deseaAbrirChatPrivado = val ?? false),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: esGas ? const Color(0xFFE65100) : categoriaSeleccionada.color),
              onPressed: () {
                final item = PublicacionItem(
                  id: DateTime.now().microsecondsSinceEpoch.toString(),
                  tipo: TipoPublicacion.pedido,
                  categoria: categoriaSeleccionada,
                  titulo: esGas ? '🔔 AVISO: Garrafa Vacía Afuera en la Cuadra' : 'Pedido: ${categoriaSeleccionada.etiqueta}',
                  descripcion: notaCtrl.text.trim().isEmpty ? (esGas ? 'Garrafa vacía lista en puerta' : 'Sin detalle') : notaCtrl.text.trim(),
                  ciudad: widget.ciudadActual,
                  barrioOTB: widget.otbActual,
                  userEmail: widget.userEmail,
                  userRole: widget.userRole,
                  point: widget.puntoInicial,
                  createdAt: DateTime.now(),
                );
                widget.alCrear(item, deseaAbrirChatPrivado);
                Navigator.pop(context);
              },
              child: Text(esGas ? '🔔 Emitir Aviso de Garrafa Vacía al Camionero' : 'Publicar Pedido en Mapa', style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Hoja Crear Aviso
// ──────────────────────────────────────────────
class HojaCrearAviso extends StatefulWidget {
  const HojaCrearAviso({super.key, required this.userEmail, required this.ciudadActual, required this.otbActual, required this.alCrear});
  final String userEmail;
  final String ciudadActual;
  final String otbActual;
  final void Function(PublicacionItem) alCrear;

  @override
  State<HojaCrearAviso> createState() => _HojaCrearAvisoState();
}

class _HojaCrearAvisoState extends State<HojaCrearAviso> {
  final tituloCtrl = TextEditingController();
  final descripcionCtrl = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.viewInsetsOf(context).bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(controller: tituloCtrl, decoration: const InputDecoration(labelText: 'Título del Aviso', border: OutlineInputBorder())),
          const SizedBox(height: 10),
          TextField(controller: descripcionCtrl, maxLines: 2, decoration: const InputDecoration(labelText: 'Descripción', border: OutlineInputBorder())),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () {
                if (tituloCtrl.text.trim().isNotEmpty) {
                  widget.alCrear(
                    PublicacionItem(
                      id: DateTime.now().microsecondsSinceEpoch.toString(),
                      tipo: TipoPublicacion.avisoBarrio,
                      categoria: CategoriaPedido.otras,
                      titulo: tituloCtrl.text.trim(),
                      descripcion: descripcionCtrl.text.trim(),
                      ciudad: widget.ciudadActual,
                      barrioOTB: widget.otbActual,
                      userEmail: widget.userEmail,
                      userRole: RolUsuario.cliente,
                      point: ciudadInicial.punto,
                      createdAt: DateTime.now(),
                    ),
                  );
                  Navigator.pop(context);
                }
              },
              child: const Text('Publicar Aviso'),
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Pestaña 1: Avisos & Rutas (Estilo Reddit / Foro de Comunidad)
// ──────────────────────────────────────────────
class _PestanaAvisosBarrio extends StatefulWidget {
  const _PestanaAvisosBarrio({
    required this.publicaciones,
    required this.rolActual,
    required this.alCrearAviso,
    required this.alProgramarRuta,
    required this.textoAnuncioNativo,
    this.urlAnuncioNativo,
  });

  final List<PublicacionItem> publicaciones;
  final RolUsuario rolActual;
  final VoidCallback alCrearAviso;
  final VoidCallback alProgramarRuta;
  final String textoAnuncioNativo;
  final String? urlAnuncioNativo;

  @override
  State<_PestanaAvisosBarrio> createState() => _PestanaAvisosBarrioState();
}

class _PestanaAvisosBarrioState extends State<_PestanaAvisosBarrio> {
  final Map<String, int> votosPosts = {};
  final Map<String, bool> miVoto = {};

  void _mostrarDialogoConfirmarBaneo(BuildContext context, String userEmail) {
    MotivoDenuncia motivoSelec = MotivoDenuncia.spam;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          title: const Row(
            children: [
              Icon(Icons.gavel, color: Colors.redAccent),
              SizedBox(width: 8),
              Text('Moderación Administrador', style: TextStyle(color: Colors.white, fontSize: 16)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('¿Banear al usuario $userEmail de NOTIGAS?', style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 12),
              const Text('Motivo de la Sanción:', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ...MotivoDenuncia.values.map(
                (m) => RadioListTile<MotivoDenuncia>(
                  dense: true,
                  title: Text(m.descripcion, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                  value: m,
                  groupValue: motivoSelec,
                  activeColor: Colors.redAccent,
                  onChanged: (val) => setModalState(() => motivoSelec = val!),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar', style: TextStyle(color: Colors.grey))),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Colors.red.shade900),
              onPressed: () {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('🚫 Usuario $userEmail BANEADO por ${motivoSelec.descripcion}.'),
                    backgroundColor: Colors.red.shade900,
                  ),
                );
              },
              child: const Text('🚫 APLICAR BANEO'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Row(
          children: const [
            Icon(Icons.forum, color: Color(0xFFFF6D00), size: 20),
            SizedBox(width: 8),
            Text(
              'r/OTB_Comunidad - Chat & Foro Barrial (Estilo Reddit)',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle, color: Color(0xFFFF6D00)),
            tooltip: 'Crear Publicación Estilo Reddit',
            onPressed: widget.alCrearAviso,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: widget.publicaciones.length,
              itemBuilder: (ctx, i) {
                final p = widget.publicaciones[i];
                final postVotos = votosPosts[p.id] ?? (p.tipo == TipoPublicacion.rutaDistribuidor ? 42 : 12);
                final yaVoto = miVoto[p.id] ?? false;

                Color flairColor = const Color(0xFF0288D1);
                String flairTexto = '📢 AVISO VECINAL';

                if (p.tipo == TipoPublicacion.rutaDistribuidor) {
                  flairColor = const Color(0xFFD84315);
                  flairTexto = '🔥 RUTA DE GAS GLP';
                } else if (p.categoria == CategoriaPedido.chatarra) {
                  flairColor = const Color(0xFF388E3C);
                  flairTexto = '♻️ CHATARRA Y PAPEL';
                } else if (p.categoria == CategoriaPedido.detergentes) {
                  flairColor = const Color(0xFF7B1FA2);
                  flairTexto = '🧴 DETERGENTE A GRANEL';
                } else if (p.categoria == CategoriaPedido.otras) {
                  flairColor = const Color(0xFF616161);
                  flairTexto = '📝 OTROS PEDIDOS / ENCARGOS';
                }

                return Card(
                  elevation: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  color: const Color(0xFF1E293B),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: Colors.blueGrey.shade700.withValues(alpha: 0.6), width: 1.2),
                  ),
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          const Color(0xFF1E293B),
                          const Color(0xFF1E293B).withValues(alpha: 0.85),
                        ],
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Column(
                            children: [
                              IconButton(
                                icon: Icon(
                                  Icons.arrow_drop_up,
                                  color: yaVoto ? const Color(0xFFFF6D00) : Colors.grey.shade400,
                                  size: 32,
                                ),
                                onPressed: () {
                                  setState(() {
                                    if (!yaVoto) {
                                      votosPosts[p.id] = postVotos + 1;
                                      miVoto[p.id] = true;
                                    } else {
                                      votosPosts[p.id] = postVotos - 1;
                                      miVoto[p.id] = false;
                                    }
                                  });
                                },
                              ),
                              Text(
                                '$postVotos',
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 13,
                                  color: yaVoto ? const Color(0xFFFF6D00) : Colors.white,
                                ),
                              ),
                              IconButton(
                                icon: Icon(Icons.arrow_drop_down, color: Colors.grey.shade500, size: 28),
                                onPressed: () {
                                  setState(() {
                                    votosPosts[p.id] = postVotos - 1;
                                  });
                                },
                              ),
                            ],
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: flairColor.withValues(alpha: 0.25),
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(color: flairColor, width: 1.2),
                                      ),
                                      child: Text(
                                        flairTexto,
                                        style: TextStyle(color: flairColor, fontSize: 10, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        'u/${anonimizarEmail(p.userEmail)}',
                                        style: const TextStyle(color: Colors.white60, fontSize: 10),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  p.titulo,
                                  style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  p.descripcion,
                                  style: const TextStyle(color: Colors.white70, fontSize: 12, height: 1.3),
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    const Icon(Icons.mode_comment_outlined, size: 14, color: Colors.white54),
                                    const SizedBox(width: 4),
                                    Text(
                                      '${(p.id.hashCode.abs() % 15) + 3} Comentarios',
                                      style: const TextStyle(color: Colors.white54, fontSize: 11),
                                    ),
                                    const Spacer(),
                                    if (widget.rolActual == RolUsuario.administrador)
                                      InkWell(
                                        onTap: () => _mostrarDialogoConfirmarBaneo(context, p.userEmail),
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(color: Colors.red.shade900, borderRadius: BorderRadius.circular(8)),
                                          child: Row(
                                            children: const [
                                              Icon(Icons.gavel, color: Colors.white, size: 12),
                                              SizedBox(width: 4),
                                              Text('🚫 BANEAR', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                                            ],
                                          ),
                                        ),
                                      )
                                    else ...[
                                      const Icon(Icons.share_outlined, size: 14, color: Colors.white54),
                                      const SizedBox(width: 4),
                                      const Text('Compartir', style: TextStyle(color: Colors.white54, fontSize: 11)),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          // ──────────────────────────────────────────────
          // BANNER MINIMALISTA NATIVO (GOOGLE ADS / PROPAGANDA PROPIA)
          // ──────────────────────────────────────────────
          InkWell(
            onTap: () {
              final link = widget.urlAnuncioNativo ?? 'https://wa.me/59170712345?text=Hola!%20Deseo%20publicar%20anuncio%20en%20NOTIGAS';
              launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication);
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.12), width: 1)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE65100).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: const Color(0xFFE65100), width: 0.8),
                    ),
                    child: const Text(
                      'Anuncio',
                      style: TextStyle(color: Color(0xFFFF6D00), fontSize: 9, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.textoAnuncioNativo,
                      style: const TextStyle(color: Colors.white70, fontSize: 11, fontStyle: FontStyle.italic),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(Icons.north_east, color: Colors.white38, size: 14),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────
// Pestaña 3: Foro Barrial (Entretenimiento, Quejas Vecinales & Apoyo Mutuo)
// ──────────────────────────────────────────────
class _PestanaChatPrivadoVendedores extends StatefulWidget {
  const _PestanaChatPrivadoVendedores({
    required this.ciudadActual,
    required this.otbActual,
    required this.usuarioGmail,
    required this.rolActual,
    required this.mensajes,
    required this.alEnviarMensaje,
  });

  final String ciudadActual;
  final String otbActual;
  final String usuarioGmail;
  final RolUsuario rolActual;
  final List<MensajeChatPrivado> mensajes;
  final Function(String, CategoriaPedido) alEnviarMensaje;

  @override
  State<_PestanaChatPrivadoVendedores> createState() => _PestanaChatPrivadoVendedoresState();
}

class _PestanaChatPrivadoVendedoresState extends State<_PestanaChatPrivadoVendedores> {
  final textoCtrl = TextEditingController();
  String categoriaForoSelec = '🗣️ QUEJA VECINAL';

  final List<Map<String, String>> temasForo = [
    {
      'id': 'f1',
      'categoria': '🗣️ QUEJA VECINAL',
      'autor': 'u/Vecino_Afectado',
      'titulo': '⚠️ ¿Alguien más sin luz en la calle 3 por la OTB?',
      'texto': 'Lleva 2 horas parpadeando el foco de la esquina. ¿A quién llamamos?',
      'votos': '19',
      'comentarios': '7',
    },
    {
      'id': 'f2',
      'categoria': '🤝 APOYO VECINAL',
      'autor': 'u/Doña_Martha_OTB',
      'titulo': '🐶 Perrito extraviado cerca de la plaza principal',
      'texto': 'Es un perrito caniche blanco con collar rojo. Si lo ven, me avisan por favor.',
      'votos': '34',
      'comentarios': '12',
    },
    {
      'id': 'f3',
      'categoria': '🎉 ENTRETENIMIENTO',
      'autor': 'u/Chisme_Barrial',
      'titulo': '⚽ Torneo relámpago de fútbol este domingo en la cancha de la OTB',
      'texto': 'Inscripciones abiertas para equipos del barrio. ¡Hay trofeo y parrillada!',
      'votos': '45',
      'comentarios': '18',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Text(
          'r/${widget.otbActual} - Foro Vecinal & Quejas',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
        ),
      ),
      body: Column(
        children: [
          // Selector de Temas del Foro Barrial
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            color: const Color(0xFF1E293B),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  '🗣️ QUEJA VECINAL',
                  '🤝 APOYO VECINAL',
                  '🎉 ENTRETENIMIENTO',
                  '💡 DATO ÚTIL OTB',
                ].map((cat) {
                  final sel = cat == categoriaForoSelec;
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(
                      label: Text(cat, style: TextStyle(fontSize: 11, color: sel ? Colors.white : Colors.white70, fontWeight: FontWeight.bold)),
                      selected: sel,
                      selectedColor: const Color(0xFFFF6D00),
                      backgroundColor: const Color(0xFF0F172A),
                      onSelected: (val) {
                        if (val) setState(() => categoriaForoSelec = cat);
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
          ),

          // Feed Estilo Reddit para Quejas, Apoyo y Entretenimiento
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: temasForo.where((t) => t['categoria'] == categoriaForoSelec).length,
              itemBuilder: (ctx, i) {
                final tema = temasForo.where((t) => t['categoria'] == categoriaForoSelec).toList()[i];
                return Card(
                  elevation: 2,
                  margin: const EdgeInsets.only(bottom: 12),
                  color: const Color(0xFF1E293B),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Column(
                          children: [
                            const Icon(Icons.arrow_drop_up, color: Color(0xFFFF6D00), size: 28),
                            Text(tema['votos']!, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                            const Icon(Icons.arrow_drop_down, color: Colors.grey, size: 24),
                          ],
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFFF6D00).withValues(alpha: 0.2),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(tema['categoria']!, style: const TextStyle(color: Color(0xFFFF6D00), fontSize: 9, fontWeight: FontWeight.bold)),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(tema['autor']!, style: const TextStyle(color: Colors.grey, fontSize: 10)),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(tema['titulo']!, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 4),
                              Text(tema['texto']!, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  const Icon(Icons.mode_comment_outlined, size: 14, color: Colors.grey),
                                  const SizedBox(width: 4),
                                  Text('${tema['comentarios']} Comentarios', style: const TextStyle(color: Colors.grey, fontSize: 11)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          // Input para Publicar Hilo de Comunidad / Queja / Apoyo
          Container(
            padding: const EdgeInsets.all(10),
            color: const Color(0xFF1E293B),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: textoCtrl,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'Publicar queja, aviso de apoyo o meme en r/${widget.otbActual}...',
                      hintStyle: const TextStyle(color: Colors.grey, fontSize: 11),
                      filled: true,
                      fillColor: const Color(0xFF0F172A),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  style: IconButton.styleFrom(backgroundColor: const Color(0xFFFF6D00)),
                  onPressed: () {
                    if (textoCtrl.text.trim().isNotEmpty) {
                      setState(() {
                        temasForo.insert(0, {
                          'id': DateTime.now().microsecondsSinceEpoch.toString(),
                          'categoria': categoriaForoSelec,
                          'autor': 'u/${anonimizarEmail(widget.usuarioGmail)}',
                          'titulo': textoCtrl.text.trim(),
                          'texto': 'Publicado en la comunidad de ${widget.otbActual}',
                          'votos': '1',
                          'comentarios': '0',
                        });
                        textoCtrl.clear();
                      });
                    }
                  },
                  icon: const Icon(Icons.send, color: Colors.white),
                ),
              ],
            ),
          ),

          // ──────────────────────────────────────────────
          // BANNER MINIMALISTA NATIVO (GOOGLE ADS / PROPAGANDA PROPIA)
          // ──────────────────────────────────────────────
          InkWell(
            onTap: () {
              const link = 'https://wa.me/59170712345?text=Hola!%20Deseo%20publicar%20anuncio%20en%20NOTIGAS';
              launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication);
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.12), width: 1)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0288D1).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: const Color(0xFF0288D1), width: 0.8),
                    ),
                    child: const Text(
                      'Anuncio',
                      style: TextStyle(color: Color(0xFF0288D1), fontSize: 9, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Servicios técnicos & Comercio local verificado en la OTB',
                      style: TextStyle(color: Colors.white70, fontSize: 11, fontStyle: FontStyle.italic),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(Icons.north_east, color: Colors.white38, size: 14),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
