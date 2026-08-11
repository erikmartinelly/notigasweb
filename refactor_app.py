import os

def refactor_js(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    ui_functions = [
        "window.addEventListener('error'",
        "window.addEventListener('unhandledrejection'",
        "window.showLoadingOverlay = function",
        "window.hideLoadingOverlay = function",
        "function showToast",
        "function showConfirmModal",
        "window.mostrarNotificacion = function",
        "function mostrarPopupAlertaRepartidor"
    ]
    
    order_functions = [
        "function abrirModalDriverOrders",
        "function closeDriverOrdersModal",
        "async function renderDriverOrdersList",
        "async function aceptarPedidoRepartidor",
        "async function confirmarEntregaPedido",
        "function checkActiveOrderStatus",
        "function abrirSubmenuPedidos",
        "function closeSubmenuModal",
        "function seleccionarYPedirDirecto",
        "function closePedidoModal",
        "function confirmarPedido",
        "function cancelarPedidoActivo",
        "async function confirmarRecepcionComprador",
        "async function abrirPanoramicaPedidos",
        "function cerrarPanoramicaPedidos",
        "function notificarEscucheCamion",
        "function lanzarEspecialEsperame",
        "function ejecutarPurgaBaseDeDatosAuto"
    ]

    out_app = []
    out_ui = ["/* UI UTILITIES */\n"]
    out_orders = ["/* ORDERS LOGIC */\n"]
    
    current_target = "app"
    brace_count = 0
    in_function = False
    
    for i, line in enumerate(lines):
        # Check if we are starting a target function
        if not in_function:
            for fn in ui_functions:
                if line.strip().startswith(fn):
                    current_target = "ui"
                    in_function = True
                    break
            
            if not in_function:
                for fn in order_functions:
                    if line.strip().startswith(fn):
                        current_target = "orders"
                        in_function = True
                        break
                        
        if current_target == "ui":
            out_ui.append(line)
        elif current_target == "orders":
            out_orders.append(line)
        else:
            out_app.append(line)
            
        if in_function:
            brace_count += line.count('{') - line.count('}')
            # We want to wait until we've seen at least one '{' and then reach 0.
            # In JS, usually the '{' is on the same line. 
            if brace_count == 0 and '{' in line:
                in_function = False
                current_target = "app"
            elif brace_count == 0 and '}' in line:
                in_function = False
                current_target = "app"
            elif brace_count < 0:
                print(f"Warning: Brace count went negative at line {i+1}")
                in_function = False
                current_target = "app"
                brace_count = 0

    # Write out files
    base_dir = os.path.dirname(file_path)
    with open(os.path.join(base_dir, 'ui.js'), 'w', encoding='utf-8') as f:
        f.writelines(out_ui)
        
    with open(os.path.join(base_dir, 'orders.js'), 'w', encoding='utf-8') as f:
        f.writelines(out_orders)
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(out_app)
        
    print(f"Refactor complete. app.js: {len(out_app)} lines, ui.js: {len(out_ui)} lines, orders.js: {len(out_orders)} lines.")

if __name__ == "__main__":
    refactor_js(r"c:\Users\FTL\Documents\APP NOTIGAS\js\app.js")
