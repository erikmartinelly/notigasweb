-- 019_delete_user_account.sql
-- Permite a un usuario borrar su propia cuenta de auth.users y todos sus datos en cascada.

CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Obtener el ID del usuario que ejecuta la función
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado. Debes iniciar sesión para eliminar tu cuenta.';
  END IF;

  -- Eliminar la cuenta del usuario de la tabla auth.users
  -- Las llaves foráneas con ON DELETE CASCADE limpiarán los datos relacionados
  DELETE FROM auth.users WHERE id = v_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
