import json
files = ['js/orders.js', 'js/map.js', 'js/forum.js', 'js/vendors.js']
brackets = {'{': '}', '(': ')', '[': ']'}
for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        js_code = f.read()
    stack = []
    for char in js_code:
        if char in brackets.keys():
            stack.append(char)
        elif char in brackets.values():
            if not stack:
                print(f"ERROR: Unmatched closing bracket {char} in {file}")
                exit(1)
            if brackets[stack[-1]] == char:
                stack.pop()
            else:
                print(f"ERROR: Mismatched closing bracket {char} in {file}")
                exit(1)
    if stack:
        print(f"ERROR: Unmatched opening bracket {stack} in {file}")
        exit(1)
print("Basic bracket check passed for all files.")
