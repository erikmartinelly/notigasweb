import json
with open('js/events.js', 'r', encoding='utf-8') as f:
    js_code = f.read()

# Let's just check for matching brackets as a basic sanity check
brackets = {'{': '}', '(': ')', '[': ']'}
stack = []
for char in js_code:
    if char in brackets.keys():
        stack.append(char)
    elif char in brackets.values():
        if not stack:
            print("ERROR: Unmatched closing bracket", char)
            exit(1)
        if brackets[stack[-1]] == char:
            stack.pop()
        else:
            print("ERROR: Mismatched closing bracket", char)
            exit(1)
if stack:
    print("ERROR: Unmatched opening bracket", stack)
    exit(1)
print("Basic bracket check passed.")
