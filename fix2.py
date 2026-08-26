import sys
with open('js/admin.js', 'r', encoding='utf-8') as f:
    c = f.read()
start = c.find('async function descargarEstadisticasGeneralesCSV()', c.find('async function descargarEstadisticasGeneralesCSV()') + 10)
end = c.find('async function switchAdminTabAvisos()', start)
c = c[:start] + c[end:]
with open('js/admin.js', 'w', encoding='utf-8') as f:
    f.write(c)
