-- 006_realtime.sql
-- CONFIGURACIÓN DE PUBLICACIONES EN TIEMPO REAL (WEBSOCKETS)

-- 6. HABILITAR REALTIME (Websockets para que el mapa se mueva en vivo)
drop publication if exists supabase_realtime;
create publication supabase_realtime for table 
    pedidos, 
    rutas_repartidores, 
    avisos,
    comentarios_avisos,
    anuncios_globales;
