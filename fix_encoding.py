import os

def fix_mojibake(text):
    # Intentar decodificar mojibake común (UTF-8 interpretado como cp1252/latin-1 y guardado como UTF-8)
    try:
        # Encodificar a cp1252 (ignorando errores raros) y decodificar a utf-8
        fixed_text = text.encode('cp1252').decode('utf-8')
        return fixed_text
    except Exception as e:
        # Si falla (por ejemplo, porque ya estaba bien o hay mezcla),
        # aplicar reemplazos manuales si se detectan los patrones comunes.
        pass
    
    # Reemplazos manuales como fallback seguro
    replacements = {
        'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
        'Ã\xa0': 'à', 'Ã¨': 'è', 'Ã¬': 'ì', 'Ã²': 'ò', 'Ã¹': 'ù',
        'Ã±': 'ñ', 'Ã‘': 'Ñ',
        'Ã': 'Á', 'Ã‰': 'É', 'Ã': 'Í', 'Ã“': 'Ó', 'Ãš': 'Ú',
        'Ã¼': 'ü', 'Ãœ': 'Ü',
        'â€œ': '“', 'â€': '”', 'â€˜': '‘', 'â€™': '’',
        'â€”': '—', 'â€“': '–', 'â€¦': '…',
        'Â¡': '¡', 'Â¿': '¿', 'Â°': '°',
        'ðŸšš': '🚛', 'ðŸ“': '📍', 'ðŸš€': '🚀', 'âœ…': '✅', 'ðŸ”¥': '🔥',
        'ðŸ›’': '🛒', 'ðŸ“ž': '📞', 'ðŸ‘¤': '👤', 'ðŸ’¡': '💡', 'ðŸš§': '🚧',
        'ðŸ”—': '🔗', 'ðŸ’': '💸', 'ðŸš': '🚲', 'ðŸŒ': '🌍', 'ðŸ”': '🔧',
        'ðŸ—': '🗑', 'âš': '⚠', 'â†': '←'
    }
    
    # Reemplazar uno a uno
    for wrong, right in replacements.items():
        text = text.replace(wrong, right)
    
    # Manejar los emojis y otros caracteres que pueden estar representados incorrectamente
    return text

def process_file(filepath):
    try:
        # Leer el archivo como binario para detectar BOM
        with open(filepath, 'rb') as f:
            raw = f.read()
            
        # Remover BOM si existe
        if raw.startswith(b'\xef\xbb\xbf'):
            raw = raw[3:]
            
        # Decodificar usando utf-8 o cp1252 si falla
        try:
            content = raw.decode('utf-8')
        except UnicodeDecodeError:
            content = raw.decode('cp1252')
            
        # Arreglar mojibake
        fixed_content = fix_mojibake(content)
        
        # Escribir de vuelta en utf-8 sin BOM si hubo cambios
        if fixed_content != content or raw != fixed_content.encode('utf-8'):
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(fixed_content)
            print(f"Fixed: {filepath}")
            
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

def main():
    root_dir = r"C:\Users\FTL\Documents\APP NOTIGAS"
    for dirpath, dirnames, filenames in os.walk(root_dir):
        if '.git' in dirpath:
            continue
        for filename in filenames:
            if filename.endswith(('.js', '.html', '.css', '.md')):
                filepath = os.path.join(dirpath, filename)
                process_file(filepath)

if __name__ == "__main__":
    main()
