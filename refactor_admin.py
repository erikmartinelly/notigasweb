import os

def refactor_admin_js(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    user_functions = [
        "function esRepartidorBaneado",
        "function banearRepartidorAdmin",
        "function limpiarTodosLosBaneosAdmin",
        "function desbanearRepartidorAdmin",
        "function borrarRepartidorPermanente",
        "function ejecutarBorradoRepartidor",
        "function borrarCompradorPermanente",
        "function ejecutarBorradoComprador",
        "function verificarBloqueoAppUsuario",
        "function verificarBaneoSilent"
    ]

    out_admin = []
    out_users = ["/* ADMIN USER MODERATION LOGIC */\n"]
    
    current_target = "admin"
    brace_count = 0
    in_function = False
    
    for i, line in enumerate(lines):
        if not in_function:
            for fn in user_functions:
                if line.strip().startswith(fn):
                    current_target = "users"
                    in_function = True
                    break
                        
        if current_target == "users":
            out_users.append(line)
        else:
            out_admin.append(line)
            
        if in_function:
            brace_count += line.count('{') - line.count('}')
            if brace_count == 0 and '{' in line:
                in_function = False
                current_target = "admin"
            elif brace_count == 0 and '}' in line:
                in_function = False
                current_target = "admin"
            elif brace_count < 0:
                print(f"Warning: Brace count went negative at line {i+1}")
                in_function = False
                current_target = "admin"
                brace_count = 0

    base_dir = os.path.dirname(file_path)
    with open(os.path.join(base_dir, 'admin_users.js'), 'w', encoding='utf-8') as f:
        f.writelines(out_users)
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(out_admin)
        
    print(f"Refactor complete. admin.js: {len(out_admin)} lines, admin_users.js: {len(out_users)} lines.")

if __name__ == "__main__":
    refactor_admin_js(r"c:\Users\FTL\Documents\APP NOTIGAS\js\admin.js")
