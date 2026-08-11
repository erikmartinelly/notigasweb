import re

with open('js/admin.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_func = """function getVerifiedAdminEmail() {
  const token = sessionStorage.getItem('notigas_admin_token');
  if (!token) return null;

  // Verificar que el email sea de la lista permitida
  const email = token.toLowerCase().trim();
  if (!ADMIN_EMAILS_ALLOWED.includes(email)) return null;

  // Verificar que la sesión no haya expirado (protección contra tokens inyectados desde consola)
  const verifiedAt = parseInt(sessionStorage.getItem('notigas_admin_verified_at') || '0', 10);
  if (!verifiedAt || (Date.now() - verifiedAt) > ADMIN_SESSION_MAX_MS) {
    // Sesión expirada o nunca verificada — limpiar y denegar
    sessionStorage.removeItem('notigas_admin_token');
    sessionStorage.removeItem('notigas_admin_verified_at');
    return null;
  }

  return email;
}"""

new_func = """function getVerifiedAdminEmail() {
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (!saved) return null;
    const u = JSON.parse(saved);
    if (!u || !u.gmail) return null;
    
    const email = u.gmail.toLowerCase().trim();
    if (!ADMIN_EMAILS_ALLOWED.includes(email)) return null;
    
    return email;
  } catch (e) {
    return null;
  }
}"""

content = content.replace(old_func, new_func)

content = re.sub(r'/\*\*.*?function _setAdminSession.*?\n\}', '', content, flags=re.DOTALL)
content = re.sub(r'function handleAdminCredentialResponse.*?\n\}', '', content, flags=re.DOTALL)
content = re.sub(r'async function encriptarSHA256.*?\n\}', '', content, flags=re.DOTALL)
content = re.sub(r'async function verificarEstadoAdmin.*?\n\}', '', content, flags=re.DOTALL)
content = re.sub(r'async function abrirModalAdminLogin.*?\n\}', '', content, flags=re.DOTALL)
content = re.sub(r'window\.registrarAdminsIniciales = async function.*?\n\}', '', content, flags=re.DOTALL)
content = re.sub(r'window\.verificarAutenticacionAdmin = async function.*?\n\}', '', content, flags=re.DOTALL)

new_dashboard = """
window.abrirModalAdminDashboard = function() {
  if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();
  const modalAdmin = document.getElementById('modalAdmin');
  if (!modalAdmin) return;
  
  const adminEmail = getVerifiedAdminEmail();
  if (!adminEmail) {
    alert("❌ Acceso Denegado. Solo administradores autorizados.");
    return;
  }
  
  modalAdmin.style.display = 'flex';
  renderAdminReports();
  if (typeof cargarAnunciosGuardados === 'function') cargarAnunciosGuardados();
}
"""

content = content.replace('function cerrarSesionRepartidorActivarComprador() {', new_dashboard + '\nfunction cerrarSesionRepartidorActivarComprador() {')

with open('js/admin.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('admin.js refactored')
