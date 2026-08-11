import re

with open('panel270977.html', 'r', encoding='utf-8') as f:
    panel_content = f.read()

with open('index.html', 'r', encoding='utf-8') as f:
    index_content = f.read()

# Extract modalAdmin
start_str = '<!-- MODAL ADMINISTRADOR EXCLUSIVO (ACCESO PROTEGIDO CON USUARIO Y CONTRASEÑA OBLIGATORIOS) -->'
start_idx = panel_content.find(start_str)

if start_idx == -1:
    print("modalAdmin not found in panel270977.html")
    exit(1)

end_str = '<!-- MODAL DE CONFIRMACIÓN ELEGANTE'
end_idx = panel_content.find(end_str)

if end_idx == -1:
    print("End of modalAdmin not found")
    exit(1)

modal_content = panel_content[start_idx:end_idx]

# We need to remove the Setup and Login screens from modal_content
setup_start = modal_content.find('<!-- PANTALLA 0: CONFIGURACIÓN INICIAL (FIRST RUN) -->')
login_end = modal_content.find('<!-- PANTALLA 2: DASHBOARD DE ADMINISTRACIÓN (SOLO VISIBLE TRAS AUTENTICARSE) -->')

clean_modal = modal_content[:setup_start] + modal_content[login_end:]

# Now insert it into index.html before the closing </body> tag
# Wait, index.html might already have a modalAdmin if I ran this before. Let's check.
if start_str in index_content:
    print("modalAdmin already injected in index.html")
    exit(0)

insert_pos = index_content.rfind('</body>')
if insert_pos == -1:
    print("</body> not found in index.html")
    exit(1)

new_index_content = index_content[:insert_pos] + clean_modal + "\n" + index_content[insert_pos:]

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(new_index_content)

print("modalAdmin successfully injected into index.html")
