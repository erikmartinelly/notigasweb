import os
import re

files = ["index.html", "panel270977.html"]
replacements = [
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x9c\xc2\x8d', b'\xf0\x9f\x93\x8d'),  # 📍
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x98\xe2\x80\xb9', b'\xf0\x9f\x91\x8b'), # 👋
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x9c\xc2\xa3', b'\xf0\x9f\x93\xa3'), # 📢
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x99\xc2\xac', b'\xf0\x9f\x92\xac'), # 💬
    (b'\xc3\xb0\xc5\xb8\x9a\x9a', b'\xf0\x9f\x9a\x9a'), # 🚚
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x9d\xc2\xa5', b'\xf0\x9f\x94\xa5'), # 🔥
    (b'\xc3\xb0\xc5\xb8\xe2\x80\x99\xc2\xa7', b'\xf0\x9f\x92\xa7'), # 💧
    (b'1\xc3\x82\xc2\xaa', b'1\xc2\xaa'), # 1ª
    (b'2\xc3\x82\xc2\xaa', b'2\xc2\xaa'), # 2ª
    (b'3\xc3\x82\xc2\xaa', b'3\xc2\xaa'), # 3ª
    (b'AUTOM\xc3\x83\xe2\x80\x9cTICA', b'AUTOM\xc3\x81TICA'), # AUTOMÁTICA
    (b'conexi\xc3\x83\xc2\xb3n', b'conexi\xc3\xb3n'), # conexión
    (b'cami\xc3\x83\xc2\xb3n', b'cami\xc3\xb3n'), # camión
    (b'ubicaci\xc3\x83\xc2\xb3n', b'ubicaci\xc3\xb3n'), # ubicación
    (b'Administraci\xc3\x83\xc2\xb3n', b'Administraci\xc3\xb3n'), # Administración
    (b'm\xc3\x83\xc2\xa1s', b'm\xc3\xa1s'), # más
    (b'aqu\xc3\x83\xc2\xad', b'aqu\xc3\xad'), # aquí
    (b'Men\xc3\x83\xc2\xba', b'Men\xc3\xba'), # Menú
    (b'D\xc3\x83\xc2\xada', b'D\xc3\xada'), # Día
    (b'd\xc3\x83\xc2\xada', b'd\xc3\xada'), # día
    (b'A\xc3\x83\xc2\xb1o', b'A\xc3\xb1o'), # Año
    (b'a\xc3\x83\xc2\xb1o', b'a\xc3\xb1o'), # año
    (b'contrase\xc3\x83\xc2\xb1a', b'contrase\xc3\xb1a'), # contraseña
    (b'\xc3\x83\xc2\xb3', b'\xc3\xb3'), # ó
    (b'\xc3\x83\xc2\xa1', b'\xc3\xa1'), # á
    (b'\xc3\x83\xc2\xa9', b'\xc3\xa9'), # é
    (b'\xc3\x83\xc2\xad', b'\xc3\xad'), # í
    (b'\xc3\x83\xc2\xba', b'\xc3\xba'), # ú
    (b'\xc3\x83\xc2\xb1', b'\xc3\xb1'), # ñ
    (b'\xc3\x83\xe2\x80\x98', b'\xc3\x91'), # Ñ
    (b'\xc3\x83\xe2\x80\x9c', b'\xc3\x93'), # Ó
    (b'\xc3\x83\x81', b'\xc3\x81'), # Á
    (b'\xc3\x82\xc2\xbf', b'\xc2\xbf'), # ¿
    (b'\xc3\x82\xc2\xa1', b'\xc2\xa1'), # ¡
    # The replacement character  is \xef\xbf\xbd, clean it up if it replaced an emoji
    (b'\xef\xbf\xbd\xef\xbf\xbd\xef\xbf\xbd ', b'\xf0\x9f\x93\x8d '), # fallback for broken emoji
    (b'\xef\xbf\xbdY"?', b'\xf0\x9f\x93\x8d'), # fallback
    (b'\xef\xbf\xbdY', b'\xf0\x9f\x93\x8d'), # fallback
    (b'\xef\xbf\xbd', b''), # remove remaining replacement chars
]

for f in files:
    if os.path.exists(f):
        with open(f, 'rb') as file:
            content = file.read()
        
        # General CP1252 to UTF-8 double encoding reversal
        # Since standard decode fails on undefined CP1252 bytes, we decode with replace,
        # but to avoid losing data we do precise byte replacements first for known corrupted sequences.
        for old, new in replacements:
            content = content.replace(old, new)
            
        with open(f, 'wb') as file:
            file.write(content)
        print(f"Fixed {f}")
