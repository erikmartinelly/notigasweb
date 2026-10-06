/* ==========================================================================
   CIERRE DE AUDITORIA DE CAPAS anon / vecino / recolector
   ==========================================================================

   1) DOS - TRUNCATE sobre proyecciones publicas
      Cualquier usuario firmado podia ejecutar
        TRUNCATE public.driver_public_profiles;
        TRUNCATE public.driver_public_presence;
      y borraba todas las fichas publicas de recolectores y su presencia en
      el mapa. RLS NO aplica a TRUNCATE, asi que el parche es REVOKE.

   2) FUGA - vecino lee pedidos ajenos completos de su ciudad
      pedidos_select_strict tenia una clausula
        (auth_user_city() <> '' AND lower(ciudad) = auth_user_city())
      que dejaba leer a cualquier vecino TODAS las columnas (telefono,
      direccion, lat/lng, descripcion) de los pedidos abiertos de su
      ciudad. El "indicador de la zona" del vecino debe salir SOLO por la
      vista enmascarada public.pedidos_publicos, no por la tabla cruda.
      La vista es SECURITY DEFINER a proposito: corre como owner para
      servir el indicador y enmascara contacto con CASE. Si esta vista se
      volviera INVOKER, la nueva politica estricta filtraria tambien las
      filas de la vista y se romperia el indicador: se deja como esta.

   3) FUGA - cualquiera firmado lee choferes_habilitados completo
      "Public SELECT choferes" (rol PUBLIC, condicion true) se combina
      con choferes_select (own/admin) y el resultado efectivo es que todo
      authenticated lee todas las filas crudas: telefono_whatsapp, placa,
      etc. Ya existe choferes_select con la condicion correcta (propia o
      admin). La politica PUBLIC solo se elimina.

   4) LIMPIEZA - politica muerta
      pedidos_select_publico_anon no tiene efecto: anon NO tiene GRANT
      SELECT sobre pedidos. Se elimina para que la superficie declarada
      coincida con la superficie efectiva.
   ========================================================================== */

-- 1) REVOKE TRUNCATE/REFERENCES/TRIGGER en proyecciones publicas
revoke truncate, references, trigger on public.driver_public_profiles from authenticated;
revoke truncate, references, trigger on public.driver_public_presence from authenticated;

-- 2) pedidos_select_strict sin clausula de ciudad: pedidos ajenos solo por la vista enmascarada
drop policy if exists pedidos_select_strict on public.pedidos;
create policy pedidos_select_strict on public.pedidos
  for select to authenticated
  using (
    is_admin_email()
    or user_id = (auth.uid())::text
    or driver_id = (auth.uid())::text
    or requested_driver_id = (auth.uid())::text
    or private.can_view_order_contact(id)
  );

-- 3) eliminar la politica PUBLIC sobre choferes_habilitados
drop policy if exists "Public SELECT choferes" on public.choferes_habilitados;

-- 4) eliminar la politica muerta de anon sobre pedidos
drop policy if exists pedidos_select_publico_anon on public.pedidos;