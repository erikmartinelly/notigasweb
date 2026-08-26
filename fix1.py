import sys
with open('index.html', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('<div class=" modal-tab-pane\ id=\modalPane3\>', '<div class=\modal-tab-pane\ id=\modalPane3_TMP\>')
c = c.replace('<div class=\modal-tab-pane\ id=\modalPaneAvisosAdmin\>', '<div class=\modal-tab-pane\ id=\modalPane3\>')
c = c.replace('<div class=\modal-tab-pane\ id=\modalPane3_TMP\>', '<div class=\modal-tab-pane\ id=\modalPaneAvisosAdmin\>')

with open('index.html', 'w', encoding='utf-8') as f:
 f.write(c)
