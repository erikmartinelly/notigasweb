#!/usr/bin/env python3
"""Puerto en Python de scripts/check_preprod_final.js.

check_preprod_final.js es el guard de seguridad mas completo del repo (190
aserciones sobre RLS, RPCs, SRI, Sentry y migraciones), pero necesita Node, que
no esta instalado en la maquina de trabajo. Este puerto permite correr esas
mismas comprobaciones antes de que CI las ejecute en Linux.

Cada asercion se declara con la misma frase que el original, asi que un fallo
reporta exactamente el mismo texto que reportaria CI.
"""
import pathlib
import re
import sys
from typing import List

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FALLOS: List[str] = []
OK = 0


def read(rel: str) -> str:
    return (RAIZ / rel).read_text(encoding="utf-8")


def exists(rel: str) -> bool:
    return (RAIZ / rel).exists()


def must(cond, msg: str) -> None:
    global OK
    if cond:
        OK += 1
    else:
        FALLOS.append(msg)
        print(f"  FAIL: {msg}")


def tiene(texto: str, aguja: str) -> bool:
    return aguja in texto


def rx(texto: str, patron: str, flags=0) -> bool:
    return re.search(patron, texto, flags) is not None


def main() -> int:
    M = "supabase/migrations/"
    orders = read("js/orders.js")
    privacy = read("js/order_privacy_layer.js")
    readme = read("README.md")
    snapshot = read("supabase/full_production_schema.sql")
    migration = read(M + "20260911205957_preprod_final_security_and_credit_messages.sql")
    legacyDrivers = read(M + "20260911210832_close_legacy_repartidores_public_read.sql")
    legacyCleanup = read(M + "20260910182449_legacy_cleanup_retention_and_privileges.sql")
    hardening = read(M + "20260913003000_security_surface_hardening.sql")
    adminWrites = read(M + "20260913004500_require_real_auth_for_administration_writes.sql")
    recheck = read(M + "20260913085148_recheck_retention_and_internal_rpc.sql")
    forumIntegrity = read(M + "20260913190218_fix_forum_vote_integrity.sql")
    contentGuard = read(M + "20260913190239_fix_content_guard_and_report_identity.sql")
    guardReconcile = read(M + "20260913190352_reconcile_content_guard_definition.sql")
    noticeRpc = read(M + "20260913190817_fix_notice_rpc_current_schema.sql")
    deleteAccount = read(M + "20260913191235_fix_delete_account_current_schema.sql")
    splitGuards = read(M + "20260913191441_split_content_guards_by_table.sql")
    adsSeparation = read(M + "20260824043251_separate_ads_from_notices.sql")
    integration = read("scripts/test_db_integration.js")
    ci = read(".github/workflows/ci.yml")
    server = read("server.js")
    adminPaymentConfig = read("js/admin_payment_config.js")
    intermediatePrivacyView = read(M + "20260911020222_preprod_public_views_privacy.sql")
    index = read("index.html")
    monitoring = read("js/monitoring.js")
    supabaseConfig = read("js/supabase-config.js")
    events = read("js/events.js")
    htaccess = read(".htaccess")

    # ------------------------------------------------------ estados legacy
    # Bolivia no cobra por pedido: ninguna funcion viva asigna suspendido_mora ni
    # suspendido_pago, asi que la UI legacy solo debe cubrir estados alcanzables.
    must(tiene(orders, "estado_servicio === 'baneado'"), "UI legacy reconoce baneado")
    must(tiene(orders, "estado_servicio === 'suspendido'"), "UI legacy reconoce suspendido")
    must(not tiene(orders, "estado_servicio === 'suspendido_mora'"),
         "UI legacy no reintroduce suspendido_mora")
    must(not tiene(orders, "estado_servicio === 'suspendido_pago'"),
         "UI legacy no reintroduce suspendido_pago")
    must(tiene(orders, "secureRenderDriverOrdersList"), "lista legacy delega al radar seguro")
    must(tiene(privacy, "'suspendido_mora'"), "radar seguro reconoce suspendido_mora")
    must(tiene(privacy, "'suspendido_pago'"), "radar seguro reconoce suspendido_pago")
    must(tiene(privacy, "'baneado'"), "radar seguro reconoce baneado")
    must(rx(privacy, r"driverCanTakeOrders = !suspended && state === 'activo'"),
         "radar solo habilita Tomar con estado activo")
    must(tiene(privacy, "driverCanTakeOrders"), "radar controla permiso de tomar pedidos")
    must(rx(privacy, r"tomarPedidoDesdeZonaPrivada\s*=\s*async"), "acción Tomar revalida estado en servidor")
    must(rx(privacy, r"if \(!access\.canTake\)"), "acción Tomar se detiene para cuentas suspendidas")
    must(rx(privacy, r"Cuenta suspendida para nuevos pedidos"), "lista segura informa suspensión sin ocultar pedidos asignados")
    must(rx(privacy, r"const takeButton = access\.canTake"), "lista segura oculta botón Tomar al suspendido")

    # ------------------------------------------------------------- docs
    must(rx(readme, r"Canonical deployment", re.I), "README usa migraciones como fuente canónica")
    must(rx(readme, r"intentionally deprecated", re.I), "README marca snapshot obsoleto")
    must(rx(snapshot, r"RAISE EXCEPTION", re.I) and rx(snapshot, r"obsoleto", re.I),
         "snapshot obsoleto falla de forma segura")

    # ---------------------------------------------- helpers no anonymous
    must(rx(migration, r"is_admin_email\(\).*FROM PUBLIC, anon", re.S), "helper admin no es endpoint anónimo")
    must(rx(migration, r"is_banned\(\).*FROM PUBLIC, anon", re.S), "helper de bloqueo no es endpoint anónimo")
    must(rx(migration, r"is_current_enabled_driver\(text,text\).*FROM PUBLIC, anon", re.S),
         "helper de repartidor no es endpoint anónimo")
    must(rx(migration, r"Alcanzaste tu límite de crédito: % pedidos cobrables / S/ %", re.I),
         "mensaje de crédito es dinámico")
    must(rx(legacyDrivers, r"DROP POLICY IF EXISTS \"Lectura publica repartidores\"", re.I),
         "tabla repartidores legacy ya no es pública")
    must(rx(legacyDrivers, r"REVOKE ALL ON public\.repartidores FROM PUBLIC, anon, authenticated", re.I),
         "teléfono/placa legacy quedan cerrados")

    # --------------------------------------------- migraciones historicas
    must(rx(legacyCleanup, r"CREATE OR REPLACE FUNCTION public\.rpc_purge_old_records", re.I),
         "migración histórica legacy_cleanup contiene el SQL remoto real")
    must(rx(legacyCleanup, r"CREATE OR REPLACE FUNCTION public\.delete_user_account", re.I),
         "migración histórica conserva borrado de cuenta aplicado")
    must(rx(legacyCleanup, r"180 days", re.I), "migración histórica conserva retención de archivo aplicada")

    # --------------------------------------------------------- hardening
    must(rx(hardening, r"private\.is_admin_email_internal", re.S), "autorización admin privilegiada vive fuera del API público")
    must(rx(hardening, r"public\.is_admin_email\(\)[\s\S]*SECURITY INVOKER", re.I),
         "wrapper admin público usa privilegios del invocador")
    must(rx(hardening, r"internal_pre_auth\.check_device_block", re.S), "chequeo de dispositivo privilegiado vive en esquema no expuesto")
    must(rx(hardening, r"rpc_verificar_bloqueo_dispositivo[\s\S]*SECURITY INVOKER", re.I),
         "RPC pre-registro público deja de ser SECURITY DEFINER")
    must(rx(hardening, r"DROP FUNCTION IF EXISTS public\.rpc_verificar_bloqueo_dispositivo\(text, text, text, text\)", re.I),
         "sobrecarga legacy de bloqueo queda eliminada")
    must(rx(hardening, r"REVOKE ALL ON TABLE public\.mensajes_foro FROM anon, authenticated", re.I),
         "tabla legacy mensajes_foro queda cerrada")
    must(rx(hardening, r"REVOKE ALL ON TABLE public\.publicaciones FROM anon, authenticated", re.I),
         "tabla legacy publicaciones queda cerrada")
    must(rx(hardening, r"ALTER DEFAULT PRIVILEGES[\s\S]*REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC", re.I),
         "funciones futuras no nacen como RPC públicos")
    must(rx(hardening, r"config_pagos_service_access", re.S), "config_pagos documenta acceso RPC-only")

    for policy in [
        "anuncios_admin_insert", "anuncios_admin_update", "anuncios_admin_delete",
        "anuncios_nativos_insert", "anuncios_nativos_update", "anuncios_nativos_delete",
        "config_publicidad_insert", "config_publicidad_update", "config_publicidad_delete",
        "storage_anuncios_admin_insert", "storage_anuncios_admin_update", "storage_anuncios_admin_delete",
    ]:
        must(tiene(adminWrites, policy), f"escritura administrativa {policy} queda redefinida")
    must(len(re.findall(r"is_anonymous", adminWrites)) >= 12,
         "todas las escrituras administrativas exigen sesión no anónima")
    must(rx(adsSeparation, r"CREATE POLICY \"storage_anuncios_read\"[\s\S]*FOR SELECT TO public", re.I),
         "lectura pública de media publicitaria se conserva")

    must(len(re.findall(r"interval '24 hours'", recheck, re.I)) >= 5, "purga final usa contrato de 24 horas")
    must(rx(recheck, r"'entregado','cancelado','recibido'", re.I), "purga final contempla todos los estados terminales")
    must(rx(recheck, r"trg_estado_pago_ocr_automatico\(\).*FROM PUBLIC, anon, authenticated", re.S | re.I),
         "trigger OCR interno no queda expuesto como RPC")
    must(rx(recheck, r"rpc_purge_old_records\(\).*FROM PUBLIC, anon, authenticated", re.S | re.I),
         "purga administrativa no queda expuesta al cliente")

    # ------------------------------------------------------- foro/votos
    must(rx(forumIntegrity, r"ADD COLUMN IF NOT EXISTS valor smallint", re.I), "ledger de votos guarda el sentido del voto")
    must(rx(forumIntegrity, r"CHECK \(valor IN \(-1, 1\)\)", re.I), "valor de voto solo admite -1 o +1")
    must(rx(forumIntegrity, r"sync_forum_vote_ledger_internal", re.S), "altas y borrados del muro sincronizan el ledger")
    must(len(re.findall(r"is_anonymous", forumIntegrity)) >= 2, "RPCs de voto rechazan sesiones anónimas")
    must(rx(forumIntegrity, r"IF v_old = v_new THEN RETURN;", re.I), "repetir el mismo voto es idempotente")
    must(rx(forumIntegrity, r"SUM\(valor\)", re.I), "contador se recalcula desde el ledger y no deriva por decrementos repetidos")

    # --------------------------------------------- guardas de contenido
    must(rx(contentGuard, r"TG_TABLE_NAME = 'denuncias'[\s\S]*NEW\.motivo[\s\S]*NEW\.detalles"),
         "migración intermedia corrigió columnas de denuncias")
    must(rx(contentGuard, r"TG_TABLE_NAME = 'reportes_spam'[\s\S]*NEW\.motivo[\s\S]*NEW\.texto"),
         "migración intermedia corrigió columnas anti-spam")
    must(rx(contentGuard, r"user_id = auth\.uid\(\)::text[\s\S]*denunciante_id = auth\.uid\(\)::text"),
         "denuncias fijan identidad real del reportante")
    must(rx(contentGuard, r"reportes_spam_insert[\s\S]*user_id = auth\.uid\(\)::text"),
         "spam fija identidad real del reportante")
    must(rx(contentGuard, r"normalize_delivery_category\(text\).*FROM PUBLIC, anon, authenticated", re.S),
         "normalizador interno deja de ser RPC público")
    must(rx(contentGuard, r"trg_estado_pago_ocr_automatico\(\).*FROM PUBLIC, anon, authenticated", re.S),
         "trigger OCR conserva cierre explícito")
    must(rx(guardReconcile, r"NEW\.direccion := LEFT\(REGEXP_REPLACE\(COALESCE\(NEW\.direccion, ''\), '<\[\^>\]\*>', '', 'g'\)", re.I),
         "reconciliación sanea HTML de dirección")

    # ----------------------------------------------------- avisos/borrado
    must(rx(noticeRpc, r"CREATE OR REPLACE FUNCTION public\.rpc_crear_aviso_vecinal", re.I),
         "RPC de publicación vecinal queda versionado")
    must(rx(noticeRpc, r"INSERT INTO public\.avisos\([\s\S]*mensaje, activo, votos, created_at", re.I),
         "RPC de aviso usa las columnas actuales")
    must(not rx(noticeRpc, r"imagen_url", re.I), "RPC de aviso no referencia columna eliminada imagen_url")
    must(rx(noticeRpc, r"is_anonymous", re.S), "RPC de aviso exige sesión real")
    must(not rx(intermediatePrivacyView, r"public\.fn_blur_(latitude|longitude)", re.I),
         "vista intermedia no depende de funciones blur retiradas")
    must(rx(intermediatePrivacyView, r"ELSE NULL::double precision END AS latitude", re.I),
         "vista intermedia no expone GPS mientras se instala el radar seguro")

    must(rx(deleteAccount, r"CREATE OR REPLACE FUNCTION public\.delete_user_account", re.I),
         "borrado total de cuenta queda reconciliado")
    must(not rx(deleteAccount, r"anuncios_globales\s+WHERE\s+user_id", re.I),
         "borrado de cuenta no referencia user_id inexistente en anuncios")
    must(rx(deleteAccount, r"is_anonymous", re.S), "borrado de cuenta exige sesión real")
    must(rx(deleteAccount, r"DELETE FROM public\.usuarios_baneados[\s\S]*permanente,false\)=false", re.I),
         "borrado conserva bloqueos permanentes antifraude")

    # ------------------------------------------- guards privados por tabla
    for fn in [
        "guard_avisos_insert_internal",
        "guard_comentarios_insert_internal",
        "guard_votos_insert_internal",
        "guard_denuncias_insert_internal",
        "guard_reportes_spam_insert_internal",
        "guard_driver_registration_insert_internal",
        "guard_driver_route_insert_internal",
    ]:
        must(tiene(splitGuards, f"private.{fn}"), f"guard privado {fn} queda definido")
        must(rx(splitGuards, rf"REVOKE ALL ON FUNCTION private\.{fn}\(\) FROM PUBLIC, anon, authenticated, service_role", re.I),
             f"{fn} no es RPC de cliente")
    must(rx(splitGuards, r"DROP FUNCTION IF EXISTS public\.guard_limited_content_insert\(\)", re.I),
         "guard heterogéneo defectuoso queda eliminado")
    must(len(re.findall(r"EXECUTE FUNCTION private\.guard_", splitGuards)) == 7,
         "los siete triggers usan guards tipados privados")

    # ---------------------------------------------------------- frontend
    # El original prohibe el control U+0090 (mojibake) y exige el texto limpio.
    must(not rx(index, "\U0001F30D\x90 Todos") and rx(index, "\U0001F30D Todos"),
         "HTML contiene directamente el filtro Todos saneado")
    must("onclick=" not in index, "index no usa controladores inline")
    must(tiene(index, "data-notigas-action") and "addEventListener('click'" in events,
         "acciones de interfaz se delegan desde events.js")
    must(rx(index, r"leaflet\.js\" integrity=\"sha384-[A-Za-z0-9+/=]+\" crossorigin=\"anonymous\""),
         "Leaflet usa SRI")
    must(rx(index, r"supabase\.min\.js\" integrity=\"sha384-[A-Za-z0-9+/=]+\" crossorigin=\"anonymous\""),
         "Supabase JS usa SRI")
    must(rx(index, r"font-awesome[^\"]+\" integrity=\"sha384-[A-Za-z0-9+/=]+\" crossorigin=\"anonymous\""),
         "Font Awesome usa SRI")

    # ------------------------------------------------------------ servidor
    must(not rx(server, r"fs\.readFileSync"), "servidor no parchea recursos del frontend en memoria")
    must(rx(server, r"app\.get\('/runtime-config\.js'"), "servidor inyecta configuración pública en tiempo de ejecución")
    must(rx(server, r"const SENTRY_DSN = String\(process\.env\.SENTRY_DSN") and rx(server, r"sentryDsn: SENTRY_DSN"),
         "runtime-config inyecta el DSN de Sentry desde el entorno")
    dsn = r"https://[A-Za-z0-9]{16,}@[^'\"\s]+\.sentry\.io"
    must(not rx(server, dsn) and not rx(index, dsn), "el DSN de Sentry no queda escrito en el repositorio")
    must(rx(index, r"js/monitoring\.js"), "HTML carga el monitoreo de errores de producción")
    must(rx(monitoring, r"if \(!dsn\)"), "el monitoreo de Sentry se activa solo cuando hay DSN")
    must("browser.sentry-cdn.com" in server and "browser.sentry-cdn.com" in htaccess,
         "CSP autoriza el CDN de Sentry en servidor y Apache")
    must(not rx(supabaseConfig, r"sb_publishable_[A-Za-z0-9_-]+"), "clave publicable no queda escrita en el frontend")
    must(rx(server, r"express\.static\(__dirname,\s*\{[\s\S]*?index:\s*false[\s\S]*?maxAge:\s*STATIC_CACHE_MAX_AGE_MS"),
         "index se sirve por ruta saneada y estáticos usan cache explícito")
    must(rx(server, r"stale-while-revalidate=86400"), "servidor permite reutilizar estáticos mientras revalida en segundo plano")
    must(tiene(adminPaymentConfig, "window.rechazarSuscripcionPremiumAdmin = retired"),
         "rechazo Premium legacy ya no llama RPC eliminado")

    # ---------------------------------------------------- migraciones en git
    for required in [
        "20260910182449_legacy_cleanup_retention_and_privileges.sql",
        "20260911020205_preprod_states_routes_privacy.sql",
        "20260911020222_preprod_public_views_privacy.sql",
        "20260911020236_preprod_payment_configuration.sql",
        "20260911020258_preprod_ocr_fail_closed.sql",
        "20260911020308_preprod_remove_legacy_premium_rpcs.sql",
        "20260911211132_preprod_financial_rls_reconcile.sql",
        "20260911211150_preprod_roles_insert_rls_reconcile.sql",
        "20260911211159_preprod_roles_update_rls_reconcile.sql",
        "20260911211211_preprod_roles_delete_rls_reconcile.sql",
        "20260911211400_require_real_auth_for_denuncias_insert.sql",
        "20260911211410_require_real_auth_for_spam_reports.sql",
        "20260911211419_require_real_auth_for_rate_limits.sql",
        "20260911211430_require_real_auth_for_banned_admin.sql",
        "20260911211439_require_real_auth_for_vote_records.sql",
        "20260913003000_security_surface_hardening.sql",
        "20260913004500_require_real_auth_for_administration_writes.sql",
        "20260913043142_optimize_security_rls_initplans.sql",
        "20260913044520_revoke_anon_internal_table_reads.sql",
        "20260913085148_recheck_retention_and_internal_rpc.sql",
        "20260913190218_fix_forum_vote_integrity.sql",
        "20260913190239_fix_content_guard_and_report_identity.sql",
        "20260913190352_reconcile_content_guard_definition.sql",
        "20260913190817_fix_notice_rpc_current_schema.sql",
        "20260913191235_fix_delete_account_current_schema.sql",
        "20260913191441_split_content_guards_by_table.sql",
    ]:
        must(exists(M + required), f"Git contiene migración remota {required}")

    # --------------------------------------------------------- integracion
    must(tiene(integration, "order_public_radar"), "integración verifica radar")
    must(tiene(integration, "rpc_get_driver_available_orders"), "integración verifica RPC legacy revocado")
    must(tiene(integration, "mensajes_foro"), "integración verifica cierre de mensajes_foro")
    must(tiene(integration, "publicaciones"), "integración verifica cierre de publicaciones")
    must(tiene(integration, "telefono_bloqueado"), "integración verifica que RPC pre-registro no filtre coincidencias")
    must(tiene(integration, "normalize_delivery_category"), "integración verifica cierre del normalizador interno")

    # ------------------------------------------------------------------ CI
    must(tiene(ci, "Verify Live Supabase Public Boundary"), "CI ejecuta integración real")
    must(tiene(ci, "Verify Final Preproduction Guardrails"), "CI ejecuta guardrail final")
    must(tiene(ci, "actions/checkout@v7"), "CI usa checkout con runtime actual")
    must(tiene(ci, "actions/setup-node@v7"), "CI usa setup-node con runtime actual")
    must(tiene(ci, "pnpm/action-setup@v6"), "CI usa pnpm action actual")
    must(tiene(ci, "grep -q '\U0001F30D Todos'"), "CI verifica el HTML realmente servido")

    print()
    print("=" * 70)
    if FALLOS:
        print(f"FALLARON {len(FALLOS)} de {OK + len(FALLOS)} aserciones del guardrail final:")
        for f in FALLOS:
            print(f"  - {f}")
        return 1
    print(f"OK: {OK} aserciones. Guardrail final de preproduccion intacto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
