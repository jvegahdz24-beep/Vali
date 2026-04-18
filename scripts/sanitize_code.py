#!/usr/bin/env python3
"""Sanitize Python code files by removing or escaping problematic characters."""
import sys
import re

def sanitize(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove zero-width characters
    content = content.replace('\u200b', '')  # zero-width space
    content = content.replace('\u200c', '')  # zero-width non-joiner
    content = content.replace('\u200d', '')  # zero-width joiner
    content = content.replace('\ufeff', '')  # BOM
    
    # Normalize line endings
    content = content.replace('\r\n', '\n')
    
    # Remove trailing whitespace per line
    lines = content.split('\n')
    lines = [line.rstrip() for line in lines]
    content = '\n'.join(lines)
    
    # Ensure file ends with newline
    if content and not content.endswith('\n'):
        content += '\n'
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Sanitized: {filepath}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python sanitize_code.py <filepath>")
        sys.exit(1)
    sanitize(sys.argv[1])
