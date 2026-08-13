import os
import re
import glob

# Files to process
js_files = glob.glob('js/*.js')

# Replacements:
# localStorage.getItem('notigas_user_data') -> AppState.get('userData')
# localStorage.setItem('notigas_user_data', JSON.stringify(X)) -> AppState.set('userData', X)
# localStorage.setItem('notigas_user_data', X) -> AppState.set('userData', JSON.parse(X))
# JSON.parse(localStorage.getItem('notigas_user_data')) -> (AppState.get('userData') || {})

# And for city, admin, gps:
# localStorage.getItem('driverGpsLive') -> (AppState.get('driverGpsLive') || 'on')
# localStorage.setItem('driverGpsLive', X) -> AppState.set('driverGpsLive', X)

# notigas_active_order:
# localStorage.getItem('notigas_active_order') -> JSON.stringify(AppState.get('activeOrder') || null)
# localStorage.setItem('notigas_active_order', JSON.stringify(X)) -> AppState.set('activeOrder', X)
# localStorage.removeItem('notigas_active_order') -> AppState.set('activeOrder', null)

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    
    # User Data
    content = re.sub(r"JSON\.parse\(localStorage\.getItem\(['\"]notigas_user_data['\"]\)\)", "AppState.get('userData')", content)
    content = re.sub(r"localStorage\.getItem\(['\"]notigas_user_data['\"]\)", "JSON.stringify(AppState.get('userData') || {})", content)
    content = re.sub(r"localStorage\.setItem\(['\"]notigas_user_data['\"],\s*JSON\.stringify\((.*?)\)\)", r"AppState.set('userData', \1)", content)
    content = re.sub(r"localStorage\.removeItem\(['\"]notigas_user_data['\"]\)", "AppState.set('userData', null)", content)
    
    # City
    content = re.sub(r"localStorage\.getItem\(['\"]notigas_city['\"]\)", "AppState.get('city')", content)
    content = re.sub(r"localStorage\.setItem\(['\"]notigas_city['\"],\s*(.*?)\)", r"AppState.set('city', \1)", content)

    # Active Order
    content = re.sub(r"localStorage\.getItem\(['\"]notigas_active_order['\"]\)", "JSON.stringify(AppState.get('activeOrder'))", content)
    content = re.sub(r"localStorage\.setItem\(['\"]notigas_active_order['\"],\s*JSON\.stringify\((.*?)\)\)", r"AppState.set('activeOrder', \1)", content)
    content = re.sub(r"localStorage\.removeItem\(['\"]notigas_active_order['\"]\)", "AppState.set('activeOrder', null)", content)

    # Driver GPS
    content = re.sub(r"localStorage\.getItem\(['\"]driverGpsLive['\"]\)", "(AppState.get('driverGpsLive') || 'on')", content)
    content = re.sub(r"localStorage\.setItem\(['\"]driverGpsLive['\"],\s*(.*?)\)", r"AppState.set('driverGpsLive', \1)", content)
    content = re.sub(r"localStorage\.removeItem\(['\"]driverGpsLive['\"]\)", "AppState.set('driverGpsLive', 'on')", content)

    # Admin
    content = re.sub(r"localStorage\.getItem\(['\"]notigas_is_admin['\"]\)", "(AppState.get('isAdmin') ? 'true' : 'false')", content)
    content = re.sub(r"localStorage\.setItem\(['\"]notigas_is_admin['\"],\s*(.*?)\)", r"AppState.set('isAdmin', \1 === 'true' || \1 === true)", content)
    content = re.sub(r"localStorage\.removeItem\(['\"]notigas_is_admin['\"]\)", "AppState.set('isAdmin', false)", content)

    # Pref Sound
    content = re.sub(r"localStorage\.getItem\(['\"]notigas_pref_sound['\"]\)", "(AppState.get('prefSound') || 'enabled')", content)
    content = re.sub(r"localStorage\.setItem\(['\"]notigas_pref_sound['\"],\s*(.*?)\)", r"AppState.set('prefSound', \1)", content)

    if original != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Modified {filepath}")

for f in js_files:
    if f.endswith('state.js'):
        continue # state.js already manually refactored
    process_file(f)

print("Done replacing localStorage dependencies.")
