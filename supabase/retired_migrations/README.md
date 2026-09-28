# Migraciones retiradas

Esta carpeta está vacía a propósito y **no forma parte de la secuencia
desplegable**. Ya no debe añadir ningún archivo aquí.

## Por qué existe

El commit `e4b55e1` movió tres migraciones a esta carpeta asumiendo que nunca
se habían aplicado en producción. Esa suposición era incorrecta y rompió el
historial de migraciones:

* `20260911011500_preprod_security_payment_hardening`
* `20260914164500_yape_remittance_bolivia_auto_ocr`
* `20260914173000_reconcile_yape_remittance_admin_queue`

Esas tres versiones **sí están aplicadas** en la tabla
`supabase_migrations.schema_migrations` del proyecto remoto. Como los archivos
ya no existían en `supabase/migrations/`, todo comando del CLI que comparara
el historial local contra el remoto fallaba con:

    Remote migration versions not found in local migrations directory.

## Regla

Un archivo de migración **nunca se borra ni se mueve** una vez aplicado. La
CLI de Supabase registra el estado por número de versión, así que un archivo
restaurado no vuelve a ejecutarse: solo hace falta que exista para que el
historial local y el remoto coincidan.

Para revertir un objeto de base de datos se escribe una migración nueva que lo
haga (`DROP`/`REVOKE`), nunca se reescribe el pasado.

Las tres migraciones se restauraron en `supabase/migrations/` mediante
`git mv`, sin modificar su contenido.
