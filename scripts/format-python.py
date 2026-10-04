"""Formatting only: read code as text, never import or execute the submission."""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
import autopep8
with open(sys.argv[1], encoding="utf-8") as source:
    code = source.read()
sys.stdout.write(autopep8.fix_code(code, options={"max_line_length": 100}))
