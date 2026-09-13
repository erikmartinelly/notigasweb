-- Least privilege: estas tablas son internas y sus policies solo contemplan sesiones autenticadas.
REVOKE SELECT ON TABLE public.pagos_comisiones FROM anon;
REVOKE SELECT ON TABLE public.registro_comisiones FROM anon;
REVOKE SELECT ON TABLE public.notificaciones_repartidor FROM anon;
REVOKE SELECT ON TABLE public.pedidos_archivo FROM anon;
