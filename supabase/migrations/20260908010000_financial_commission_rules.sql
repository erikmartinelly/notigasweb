-- 20260908010000_financial_commission_rules.sql
-- Compatibilidad histórica de esquema financiero.
-- Esta versión conserva únicamente la estructura base requerida por migraciones
-- posteriores. El contrato financiero vigente de NOTIGAS Perú se consolida en
-- las migraciones git_reconcile_* de 20260910 y posteriores:
--   * comisión por pedido confirmado: S/ 0.20
--   * ciclo de crédito: 100 pedidos
--   * límite monetario: S/ 20.00
--   * sin cobro/baneo semanal programado
-- No definir aquí RPC ni tareas cron obsoletas.

ALTER TABLE public.choferes_habilitados
  ADD COLUMN IF NOT EXISTS comisiones_pendientes numeric(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS limite_credito numeric(10,2) NOT NULL DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS estado_servicio text NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS ultimo_corte_semanal timestamptz,
  ADD COLUMN IF NOT EXISTS total_comisiones_pagadas numeric(10,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.choferes_habilitados
  ALTER COLUMN limite_credito SET DEFAULT 20.00;

CREATE INDEX IF NOT EXISTS idx_choferes_comisiones
  ON public.choferes_habilitados (comisiones_pendientes);
CREATE INDEX IF NOT EXISTS idx_choferes_estado_servicio
  ON public.choferes_habilitados (estado_servicio);

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS comision_entrega numeric(10,2) DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS comision_registrada boolean DEFAULT false;

ALTER TABLE public.pedidos
  ALTER COLUMN comision_entrega SET DEFAULT 0.20;

CREATE TABLE IF NOT EXISTS public.registro_comisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  driver_id uuid REFERENCES public.choferes_habilitados(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  monto numeric(10,2) NOT NULL DEFAULT 0.00,
  saldo_anterior numeric(10,2) NOT NULL DEFAULT 0.00,
  saldo_nuevo numeric(10,2) NOT NULL DEFAULT 0.00,
  referencia text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reg_comisiones_user_id
  ON public.registro_comisiones (user_id);
CREATE INDEX IF NOT EXISTS idx_reg_comisiones_created_at
  ON public.registro_comisiones (created_at DESC);

ALTER TABLE public.registro_comisiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can read their own commission records"
  ON public.registro_comisiones;
CREATE POLICY "Drivers can read their own commission records"
  ON public.registro_comisiones
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid())::text = user_id OR public.is_admin_email());
