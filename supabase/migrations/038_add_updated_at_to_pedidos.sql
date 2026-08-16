-- 038_add_updated_at_to_pedidos.sql
-- 1. Agregar columna updated_at a tabla pedidos si no existe
ALTER TABLE public.pedidos
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;

-- 2. Trigger para mantener updated_at actualizado automáticamente en cualquier modificación
CREATE OR REPLACE FUNCTION public.set_pedidos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_updated_at ON public.pedidos;
CREATE TRIGGER trg_pedidos_updated_at
BEFORE UPDATE ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.set_pedidos_updated_at();

-- 3. Índice para consultas optimizadas por updated_at
CREATE INDEX IF NOT EXISTS idx_pedidos_updated_at ON public.pedidos (updated_at DESC);

-- 4. Re-asegurar permisos de ejecución de rpc_assign_order
GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;
