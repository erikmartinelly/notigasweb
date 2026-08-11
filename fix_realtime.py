import re

with open('js/supabase-config.js', 'r', encoding='utf-8') as f:
    content = f.read()

# We will use regex to find the section
target_pattern = re.compile(r"(\.on\('postgres_changes', \{ event: '\*', schema: 'public', table: 'avisos', filter: `ciudad=eq\.\$\{activeCity\}` \}, payload => \{\s*if \(typeof renderForumFeed === 'function'\) renderForumFeed\(\);\s*\})\s*\.on\('postgres_changes', \{ event: '\*', schema: 'public', table: 'comentarios_avisos'", re.DOTALL)

replacement = r"\1\n        .on('postgres_changes', { event: '*', schema: 'public', table: 'anuncios_globales', filter: `ciudad=eq.${activeCity}` }, payload => {\n            if (typeof cargarAnunciosGuardados === 'function') cargarAnunciosGuardados();\n        })\n        .on('postgres_changes', { event: '*', schema: 'public', table: 'comentarios_avisos'"

new_content = target_pattern.sub(replacement, content)

with open('js/supabase-config.js', 'w', encoding='utf-8') as f:
    f.write(new_content)
