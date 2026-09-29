-- Catalogo activo de NOTIGAS Bolivia: solo reciclaje + detergentes.
--
-- Contexto
-- --------
-- El catalogo vigente habia quedado reducido a cinco materiales, pero el
-- formulario del cliente seguia ofreciendo las once categorias, por lo que
-- seis de ellas fallaban al enviar el pedido con
-- "Categoria fuera del catalogo NOTIGAS Bolivia".
--
-- Decision de negocio
-- -------------------
-- NOTIGAS es un servicio de reciclaje. Se retiran del catalogo todas las
-- compras salvo los detergentes: sal, afilado de cuchillos, agua purificada y
-- "otros pedidos" dejan de ser categorias de pedido. "Compra de sal" y
-- "Afilado de cuchillos" sobreviven como servicios adicionales que ofrece el
-- recolector por su cuenta, fuera del flujo de pedidos de la plataforma.
--
-- Por que no se toca el historico
-- -------------------------------
-- public.notigas_catalogo_categorias_historico() sigue devolviendo las once
-- categorias. Ese historico alimenta notigas_categoria_valida(), que a su vez
-- respalda el CHECK pedidos_categoria_catalogo_chk. Conservarlo permite que
-- los pedidos ya publicados con las categorias retiradas sigan siendo validos
-- y visibles; el recorte solo aplica a los pedidos nuevos, que los valida
-- guard_optional_order_insert() contra notigas_categoria_activa().

create or replace function public.notigas_catalogo_categorias()
returns table(codigo text, etiqueta text, grupo text, tipo_solicitud text)
language sql
immutable
set search_path to ''
as $$
  select * from (values
    ('plastico',     'Plastico',                  'recolector',  'recogida'),
    ('papel',        'Papel / Carton',            'recolector',  'recogida'),
    ('chatarra',     'Chatarra',                  'recolector',  'recogida'),
    ('botellas',     'Botellas Plastico / Vidrio','recolector',  'recogida'),
    ('organico',     'Organico Seleccionado',     'recolector',  'recogida'),
    ('frutas',       'Frutas & Verduras',         'recolector',  'recogida'),
    ('detergentes',  'Detergentes & Limpieza',    'compra',      'compra')
  ) as t(codigo, etiqueta, grupo, tipo_solicitud);
$$;

comment on function public.notigas_catalogo_categorias() is
  'Catalogo vigente: seis materiales reciclables mas detergentes. '
  'Sal, afilado, agua y otros se retiraron de los pedidos; permanecen solo en el historico.';
