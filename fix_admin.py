import re

with open('js/admin.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace simple cases without args
content = re.sub(r'onclick="([a-zA-Z0-9_]+)\(\)"', r'data-action="\1"', content)

# specific cases
content = content.replace(
    'onclick="borrarAnuncioLocalAdmin(\'\')"',
    'data-action="borrarAnuncioLocalAdmin" data-id=""'
)
content = content.replace(
    'onclick="borrarPostForumAdmin(\'\')"',
    'data-action="borrarPostForumAdmin" data-id=""'
)
content = content.replace(
    'onclick="aprobarRepartidorAdmin(\'\')"',
    'data-action="aprobarRepartidorAdmin" data-id=""'
)
content = content.replace(
    'onclick="desbanearRepartidorAdmin(\'\', decodeURIComponent(\'\'))"',
    'data-action="desbanearRepartidorAdmin" data-id="" data-name=""'
)
content = content.replace(
    'onclick="banearRepartidorAdmin(\'\', decodeURIComponent(\'\'), decodeURIComponent(\'\'))"',
    'data-action="banearRepartidorAdmin" data-id="" data-name="" data-plate=""'
)
content = content.replace(
    'onclick="borrarRepartidorPermanente(\'\', decodeURIComponent(\'\'))"',
    'data-action="borrarRepartidorPermanente" data-id="" data-name=""'
)
content = content.replace(
    'onclick="banearUsuarioAdmin(\'\')"',
    'data-action="banearUsuarioAdmin" data-gmail=""'
)
content = content.replace(
    'onclick="borrarCompradorPermanente(\'\', \'\')"',
    'data-action="borrarCompradorPermanente" data-gmail="" data-name=""'
)
content = content.replace(
    'onclick="borrarPedidoFantasmaAdmin(\'supabase\', \'\')"',
    'data-action="borrarPedidoFantasmaAdmin" data-type="supabase" data-id=""'
)
content = content.replace(
    'onclick="borrarPedidoFantasmaAdmin(\'active_order\')"',
    'data-action="borrarPedidoFantasmaAdmin" data-type="active_order"'
)
content = content.replace(
    'onclick="borrarPedidoFantasmaAdmin(\'truck_report\', )"',
    'data-action="borrarPedidoFantasmaAdmin" data-type="truck_report" data-idx=""'
)
content = content.replace(
    'onclick="borrarDenunciaAdmin(\'\')"',
    'data-action="borrarDenunciaAdmin" data-id=""'
)
content = content.replace(
    'onclick="banearUsuarioAdmin(\'\')"',
    'data-action="banearUsuarioAdmin" data-id=""'
)
content = content.replace(
    'onclick="desbanearUsuarioAdmin(\'\')"',
    'data-action="desbanearUsuarioAdmin" data-id=""'
)

with open('js/admin.js', 'w', encoding='utf-8') as f:
    f.write(content)
