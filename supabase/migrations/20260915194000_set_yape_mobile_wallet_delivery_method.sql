-- Texto operativo que se muestra en las instrucciones de remesa a Bolivia.
update public.config_pagos
set metodo_entrega = 'Billetera Móvil Yape', updated_at = now()
where id = 1;
