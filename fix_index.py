import sys
with open('index.html', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('id=modalPane3', 'id=modalPaneAvisosAdmin_TEMP')
c = c.replace('id=modalPaneAvisosAdmin', 'id=modalPane3')
c = c.replace('id=modalPaneAvisosAdmin_TEMP', 'id=modalPaneAvisosAdmin')
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('Fixed Bug 1')
