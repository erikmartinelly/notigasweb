-- 20260908005000_device_id_dni_hardware_ban.sql
-- Compatibilidad histórica de esquema.
-- Esta migración conserva únicamente las columnas e índices base necesarios para
-- reconstrucciones nuevas. La lógica de bloqueo vigente se define posteriormente
-- en 20260910193151_git_reconcile_order_security_peru.sql y
-- 20260910205311_fix_device_block_rpc_overload_ambiguity_v2.sql.
-- No definir aquí reglas financieras ni RPC de negocio para evitar reintroducir
-- contratos obsoletos durante un db reset o un despliegue desde cero.

ALTER TABLE public.usuarios_baneados
  ADD COLUMN IF NOT EXISTS dni text,
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS device_fingerprint text;

CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_device_id
  ON public.usuarios_baneados (device_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_fingerprint
  ON public.usuarios_baneados (device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_dni
  ON public.usuarios_baneados (dni);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_placa
  ON public.usuarios_baneados (placa);

ALTER TABLE public.choferes_habilitados
  ADD COLUMN IF NOT EXISTS dni text,
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS bloqueado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_bloqueo text;

CREATE INDEX IF NOT EXISTS idx_choferes_device_id
  ON public.choferes_habilitados (device_id);
CREATE INDEX IF NOT EXISTS idx_choferes_fingerprint
  ON public.choferes_habilitados (device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_choferes_dni
  ON public.choferes_habilitados (dni);
