import re
import os

html_path = 'index.html'
js_path = 'js/events.js'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Match onclick="something" or onclick='something'
pattern_double = r'(<(?:[a-zA-Z0-9]+)\s+[^>]*?)(on(click|change|keypress|submit|input))="([^"]+)"([^>]*?>)'
pattern_single = r"(<(?:[a-zA-Z0-9]+)\s+[^>]*?)(on(click|change|keypress|submit|input))='([^']+)'([^>]*?>)"

counter = 1
events_code = []

def replacer(match):
    global counter
    prefix = match.group(1)
    event_type = match.group(3)
    func_call = match.group(4)
    suffix = match.group(5)
    
    id_match = re.search(r'\bid=[\'"]([^\'"]+)[\'"]', prefix + suffix)
    if id_match:
        elem_id = id_match.group(1)
    else:
        elem_id = f'auto-event-{counter}'
        counter += 1
        prefix = f'{prefix} id="{elem_id}" '
        
    events_code.append({
        'id': elem_id,
        'event': event_type,
        'call': func_call
    })
    
    return f'{prefix}{suffix}'

new_content = re.sub(pattern_double, replacer, content)
while re.search(pattern_double, new_content):
    new_content = re.sub(pattern_double, replacer, new_content)

new_content = re.sub(pattern_single, replacer, new_content)
while re.search(pattern_single, new_content):
    new_content = re.sub(pattern_single, replacer, new_content)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

js_output = "/* Eventos generados automáticamente para reemplazar eventos inline */\n"
js_output += "document.addEventListener('DOMContentLoaded', () => {\n"
for ev in events_code:
    call = ev['call']
    call = call.replace('this.value', f"document.getElementById('{ev['id']}').value")
    call = call.replace('this', f"document.getElementById('{ev['id']}')")
    
    var_name = ev['id'].replace('-', '_')
    js_output += f"    const el_{var_name} = document.getElementById('{ev['id']}');\n"
    if ev['event'] == 'keypress':
        js_output += f"    if (el_{var_name}) el_{var_name}.addEventListener('{ev['event']}', (event) => {{ {call} }});\n"
    else:
        js_output += f"    if (el_{var_name}) el_{var_name}.addEventListener('{ev['event']}', (event) => {{ {call} }});\n"
        
js_output += "});\n"

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_output)

print(f"Replaced {len(events_code)} events.")
