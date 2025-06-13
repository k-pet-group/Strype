# Given the a JSON file with autocomplete items on stdin,
# queries the local Python implementation to get the docs wherever possible.
# Outputs the same data but with documentation filled in, to stdout.

import importlib
import inspect
import json
import pydoc
import re
import sys
from operator import attrgetter

sys.path.append("../public/public_libraries")
sys.path.append("./stubs")

def parse_arguments(text, func_name):
    # Split the text into lines
    lines = text.splitlines()
    
    # Find the first line that (ignoring whitespace) starts with func_name + "("
    for line in lines:
        stripped_line = line.strip()
        if stripped_line.startswith(func_name + "("):
            # Extract the part after func_name + "("
            argument_part = stripped_line[len(func_name + "("):]
            # Initialize variables to store arguments
            arguments = []
            current_arg = ''
            in_quotes = False
            quote_char = ''
            
            # Parse the argument part
            just_had_square_bracket = False
            for char in argument_part:
                if char in ('"', "'") and not in_quotes:
                    in_quotes = True
                    quote_char = char
                elif char == quote_char and in_quotes:
                    in_quotes = False
                    quote_char = ''
                elif char == '[' and not in_quotes:
                    just_had_square_bracket = True
                    continue
                elif char == ',' and just_had_square_bracket and not in_quotes:
                    # Square bracket can be used like this: 
                    # foo(required [, optional])
                    # So we treat it like a comma followed by )
                    # i.e. we add the current arg and stop
                    arguments.append(current_arg.strip())
                    current_arg = ''
                    break
                elif (char == ')' or char == '*' or (char == '.' and current_arg.isspace())) and not in_quotes:
                    # * is special args, leading dot is part of "..." and we stop at that too.
                    current_arg = ''
                    break
                elif char == ',' and not in_quotes:
                    arguments.append(current_arg.strip())
                    current_arg = ''
                else:
                    current_arg += char
                just_had_square_bracket = False
            
            # Append the last argument if any
            if current_arg:
                arguments.append(current_arg.strip())
            
            # Filter out arguments containing '='
            filtered_arguments = [{"name": arg} for arg in arguments if '=' not in arg]
            
            return filtered_arguments
    
    return None  # Return None if no suitable line is found


targetAPI = json.load(sys.stdin)
for mod in targetAPI:
    # If you "import this" it outputs to stdout and messes with our output, so don't do that:
    if mod == "this":
        continue
    try:
        imp_mod = importlib.import_module(mod if mod else "builtins", package=None)
    except:
        # A module that's in Skulpt but not pure Python, like webgl
        continue
    for item in targetAPI[mod]:
        # Each item has an "acResult" with the name
        if not item['documentation']:
            try:
                doc = inspect.getdoc(attrgetter(item['acResult'])(imp_mod))
                # Some functions now have their type signature first, which we will omit by removing up
                # to the first \n\n that follows such signature(s):
                if re.compile("^[A-Za-z0-9]+\\(").match(doc):
                    doubleNL = doc.find("\n\n")
                    if doubleNL > 0:
                        doc = doc[doubleNL:]
                item['documentation'] = doc.strip().replace('\r\n', '\n')
            except:
                # If we get an AttributeError or any other error, we just can't provide the doc:
                pass
        if 'function' in item['type'] and not 'params' in item:
            try:
                 argspec = inspect.getfullargspec(attrgetter(item['acResult'])(imp_mod))
                 # The args item in the tuple is a list of names of positional arguments:
                 numArgs = len(argspec.args)
                 if numArgs > 0:
                    # As per https://stackoverflow.com/questions/47599749/check-if-function-belongs-to-a-class
                    # check if the method belongs to a class:
                    try:
                        hasTypeSelfParam = '.' in attrgetter(item['acResult'] + '.__qualname__')(imp_mod)
                    except:
                        # Might not have a qualname:
                        hasTypeSelfParam = False
                    # Constructors are separate, but can be identified by showing up as function and a type:
                    if 'function' in item['type'] and 'type' in item['type']:
                        hasTypeSelfParam = True
                    item['params'] = []
                    for i, arg in enumerate(argspec.args):
                        details = {"name": arg}
                        if i == 0 and hasTypeSelfParam:
                            details['hide'] = True
                        # The defaults item in the tuple is None or a list of default values but it goes backwards
                        # So if you have 5 args, and 2 in the default, they apply to the fifth and fourth arg
                        if argspec.defaults and ((numArgs - i) <= len(argspec.defaults)):
                            try:
                                defVal = str(argspec.defaults[numArgs - i - 1])
                                # Don't record things like "<unittest.loader.TestLoader object at 0x10391f8e0>" as a defaultValue,
                                # as it changes each run:
                                defVal = re.sub(r' at 0x[0-9a-fA-F]+', "", defVal)
                                details['defaultValue'] = defVal 
                            except:
                                pass
                        item['params'].append(details)
                        
            except:
                try:
                    # print is a weird case because the docs say it has a mandatory argument,
                    # but actually you can call it without any args
                    if item['acResult'] == "print" and (mod == "builtins" or not mod):
                        del item['params']
                    else:
                        args = parse_arguments(pydoc.render_doc(mod + "." + item['acResult']), item['acResult'])
                        if args:
                            item['params'] = args 
                except:
                    pass
                pass 


json.dump(targetAPI, sys.stdout, indent=4)
