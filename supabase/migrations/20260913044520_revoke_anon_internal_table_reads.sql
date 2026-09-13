-- Recovered from the applied Supabase migration history to restore Git/remote parity.
REVOKE SELECT ON TABLE public.pagos_comisiones FROM anon;
REVOKE SELECT ON TABLE public.registro_comisiones FROM anon;
REVOKE SELECT ON TABLE public.notificaciones_repartidor FROM anon;
REVOKE SELECT ON TABLE public.pedidos_archivo FROM anon;
