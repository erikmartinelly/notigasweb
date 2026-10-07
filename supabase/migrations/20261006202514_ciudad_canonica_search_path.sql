/* ==========================================================================
   CIERRA EL AVISO DEL ADVISOR: notigas_ciudad_canonica sin search_path
   ==========================================================================
   El linter 0011 (function_search_path_mutable) marca funciones cuyo
   search_path depende del rol que las llama. Esta funcion se usa dentro de
   CHECK constraints, asi que debe resolver siempre igual: se fija el
   search_path vacio.

   Con search_path = '' los operadores siguen resolviendose porque
   pg_catalog se busca implicitamente siempre: lower(), btrim() y
   regexp_replace() viven ahi.
   ========================================================================== */

ALTER FUNCTION public.notigas_ciudad_canonica(text)
  SET search_path TO '';

COMMENT ON FUNCTION public.notigas_ciudad_canonica(text) IS
  'Las 9 capitales de Bolivia mas El Alto. Devuelve NULL si la ciudad no pertenece al catalogo. search_path fijado: se usa dentro de CHECK constraints.';