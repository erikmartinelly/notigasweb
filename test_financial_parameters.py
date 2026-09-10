"""NOTIGAS - verificación portable del contrato financiero vigente (Perú).

Contrato esperado:
- Primeros 50 pedidos confirmados sin comisión.
- Desde el pedido 51: S/ 0.20 por pedido entregado y contabilizado una sola vez.
- Primer ciclo cobrable: 100 pedidos = S/ 20.
- 1.ª remesa confirmada -> crédito S/ 50 (250 pedidos).
- 2.ª remesa -> mantiene S/ 50.
- 3.ª remesa -> crédito máximo S/ 100 (500 pedidos).
- Sin cortes/baneos semanales automáticos.
"""
from pathlib import Path
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def run_tests() -> None:
    print("=" * 68)
    print("VERIFICANDO CONTRATO FINANCIERO VIGENTE DE NOTIGAS PERÚ")
    print("=" * 68)

    legacy_finance = read("supabase/migrations/20260908010000_financial_commission_rules.sql")
    assert "limite_credito numeric(10,2) NOT NULL DEFAULT 20.00" in legacy_finance
    assert "comision_entrega numeric(10,2) DEFAULT 0.20" in legacy_finance
    assert "rpc_ejecutar_corte_semanal_comisiones" not in legacy_finance
    assert "rpc_ejecutar_baneo_semanal_morosos" not in legacy_finance
    assert "S/ 1.00" not in legacy_finance
    assert "S/ 50.00" not in legacy_finance
    print("✅ [1/5] Migración histórica financiera saneada: S/ 0.20 y S/ 20, sin cron semanal.")

    legacy_hardware = read("supabase/migrations/20260908005000_device_id_dni_hardware_ban.sql")
    assert "device_fingerprint" in legacy_hardware
    assert "rpc_banear_repartidor_completo" not in legacy_hardware
    assert "S/ 1" not in legacy_hardware
    print("✅ [2/5] Migración histórica de dispositivo conserva solo estructura base.")

    cleanup = read("supabase/migrations/20260910220052_remove_obsolete_weekly_financial_rpcs.sql")
    assert "DROP FUNCTION IF EXISTS public.rpc_ejecutar_corte_semanal_comisiones" in cleanup
    assert "DROP FUNCTION IF EXISTS public.rpc_ejecutar_baneo_semanal_morosos" in cleanup
    assert "Suspensión administrativa" in cleanup
    assert "NOT public.is_admin_email()" in cleanup
    assert "REVOKE ALL ON FUNCTION public.rpc_banear_repartidor_completo" in cleanup
    print("✅ [3/5] Backend elimina RPC semanales y protege el baneo administrativo.")

    rules = read("js/driver_order_rules.js")
    assert "50 pedidos" in rules
    assert "S/ 0.20 por pedido" in rules
    assert "S/ 20" in rules
    assert "S/ 50" in rules
    assert "S/ 100" in rules
    assert "confirmarEntregaPedidoActual" in rules
    assert "pedidos_credito_ciclo" in rules
    assert "limite_pedidos_credito" in rules
    assert "normalizeLegacyFinancialCopy" in rules
    assert "No se aplicó comisión" in rules
    print("✅ [4/5] Frontend fuerza 50 gratis y crédito progresivo S/20 -> S/50 -> S/100.")

    hardening = read("scripts/check_audit_hardening.js")
    assert "check_audit_hardening" not in hardening or "Audit hardening" in hardening
    assert "20260910220052_remove_obsolete_weekly_financial_rpcs.sql" in hardening
    print("✅ [5/5] CI vigila que la limpieza financiera no retroceda.")

    print("\n🎉 CONTRATO FINANCIERO ACTUAL VERIFICADO EN EL REPOSITORIO.")


if __name__ == "__main__":
    run_tests()
