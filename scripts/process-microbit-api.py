# This script is used as a preprocessing step.  It is NOT run live by Strype,
# but instead run manually via the preprocess:update-microbit-api NPM task.
# It checks out the microbit foundation's stubs for the microbit API
# then processes them into a JSON file with all the API details for Strype's
# autocomplete.  It thus only needs to be re-run if their microbit API
# has changed.  The resulting file is checked in to Git since it won't change
# often.  (This script just outputs on stdout; the path of the resulting
# file is set in package.json where the NPM task is defined.)

import ast
import json
import os
from pathlib import Path
import re
import subprocess
import sys

# The format is (see ac-types.ts for details):
# {"full.module.name": [{acResult: "simple_name", documentation: "", type: "function", version: 1, params?, signature?]}
found = {}

class TreeWalk(ast.NodeVisitor):
    def __init__(self, moduleName):
        self.content = {}
        # This is used to resolve the version against microbit.json which lists all v2+ parts of the microbit API.
        self.moduleName = moduleName
        
    def visit_FunctionDef(self, node):
        if not node.name in self.content:
            self.content[node.name] = {"acResult": node.name, "type": [], "documentation": ast.get_docstring(node) or "", "version": getMicrobitVersion(self.moduleName, node.name)}
            # Put args together:
            args = node.args
            default_offset = len(args.args) - len(args.defaults)

            def get_default(i, default_list, offset=0):
                index = i - offset
                if 0 <= index < len(default_list):
                    try:
                        d = default_list[index]
                        if isinstance(d, ast.Constant):
                            return str(d.value)
                        elif isinstance(d, ast.Name):
                            return d.id
                        else:
                            return str(ast.literal_eval(d))
                    except Exception as e:
                        print("ERROR PARSING DEFAULT", e)
                return None
            
            def get_annotation(arg):
                if arg.annotation:
                    try:
                        # Use ast.unparse if available (Python 3.9+)
                        if hasattr(ast, "unparse"):
                            return ast.unparse(arg.annotation)
                        else:
                            # Fallback: manually approximate (may not cover all cases)
                            if isinstance(arg.annotation, ast.Name):
                                return arg.annotation.id
                            elif isinstance(arg.annotation, ast.Subscript):
                                return "<subscript type>"
                            elif isinstance(arg.annotation, ast.Attribute):
                                return f"{arg.annotation.value.id}.{arg.annotation.attr}"
                            else:
                                return ast.dump(arg.annotation)
                    except Exception as e:
                        print("ERROR PARSING ANNOTATION", e)
                return None

            def clean_arg_name(arg):
                return re.sub(r'^_+', '', arg.arg)

            signature = {
                "positionalOnlyArgs": [],
                "positionalOrKeywordArgs": [],
                "varArgs": None,
                "keywordOnlyArgs": [],
                "varKwargs": None,
                "firstParamIsSelfOrCls": False
            }

            # First param check
            if args.args:
                first_arg_name = args.args[0].arg
                if first_arg_name in ("self", "cls"):
                    signature["firstParamIsSelfOrCls"] = True

            # Positional-only args (Python 3.8+)
            posonly = getattr(args, "posonlyargs", [])
            for i, arg in enumerate(posonly):
                signature["positionalOnlyArgs"].append({
                    "name": clean_arg_name(arg),
                    "defaultValue": get_default(i, args.defaults, default_offset),
                    "argType": get_annotation(arg)
                })

            ## Positional-or-keyword args
            for i, arg in enumerate(args.args):
                arg_index = i + len(posonly)
                signature["positionalOrKeywordArgs"].append({
                    "name": clean_arg_name(arg),
                    "defaultValue": get_default(arg_index, args.defaults, default_offset),
                    "argType": get_annotation(arg)
                })

            # *args
            if args.vararg:
                signature["varArgs"] = {
                    "name": clean_arg_name(args.vararg),
                    "argType": get_annotation(args.vararg)
                }

            # Keyword-only args
            for i, arg in enumerate(args.kwonlyargs):
                default_val = get_default(i, args.kw_defaults)
                signature["keywordOnlyArgs"].append({
                    "name": clean_arg_name(arg),
                    "defaultValue": default_val,
                    "argType": get_annotation(arg)
                })

            # **kwargs
            if args.kwarg:
                signature["varKwargs"] = {
                    "name": clean_arg_name(args.kwarg),
                    "argType": get_annotation(args.kwarg)
                }

            #TODO : observed issue with micro:bit things, like "Image(self, string)", but not sure it is a problem that self is in positionalOrKeywordArgs by mistake or a default behaviour
            # it also happens rarely in skulpt-api, what we do here is move it manually to the right place.
            if signature["firstParamIsSelfOrCls"] and len(signature["positionalOrKeywordArgs"]) > 0 and (signature["positionalOrKeywordArgs"][0]["name"] == "self" or signature["positionalOrKeywordArgs"][0]["name"] == "cls") :
                signature["positionalOnlyArgs"].insert(0, signature["positionalOrKeywordArgs"].pop(0))

            self.content[node.name]['signature'] = signature   
            
        self.content[node.name]["type"].append("function")
    def visit_ClassDef(self, node):
        if not node.name in self.content:
            self.content[node.name] = {"acResult": node.name, "type": [], "documentation": ast.get_docstring(node) or "", "version": getMicrobitVersion(self.moduleName, node.name)}
        self.content[node.name]["type"].append("type")
        # Classes have a constructor:
        self.content[node.name]["type"].append("function")
        # Visit children of this class to find its constructor
        # Temporarily change the tree walker module name and content
        old_module = self.moduleName
        old_content = self.content
        self.moduleName = self.moduleName + "." + node.name if len(self.moduleName) > 0 else node.name
        self.content = {}
        # We need to use the __init__ arguments and signature parts to plunk them inside
        # the class after we're done with checkking all children
        # Note that a class may be a super class, so we may need to check the super class
        # and we expect it to be defined beforehand... (in Python, a class can inherit from
        # several parents, but __init__ will be chose as the first one (MRO)).
        class_signature = None
        for child in node.body:
            signature = self.visit_with_updated_module(child)            
            if signature is not None and child.name == "__init__" :
                class_signature = signature
        for base_class in node.bases:
            # Limit to simple inheritance
            if isinstance(base_class, ast.Name) :
                # We try to get the content from upper level, if it doesn't get anything, we just skip
                signature_of_base = findSignatureForClassInOldContent(old_content, base_class.id)
                if class_signature is None and signature_of_base is not None :
                    class_signature =  signature_of_base   
        # Restaure the tree walker module name and content
        self.moduleName = old_module
        self.content = old_content
        # Add the class signature, if we got it
        if class_signature is not None :
            self.content[node.name]["signature"] = class_signature
    def visit_with_updated_module(self, node):
        self.visit(node)
        # Return the signature if we got one (see above why)
        try :
            return self.content[node.name]["signature"]
        except (KeyError, AttributeError) :
            return None
    def visit_AnnAssign(self, node):
        # Picks up items like "button_a : Button" which appear in the type stubs.  The target is the LHS.
        # In order to get a/c on these without using TPP (see Autocompletion.vue for details), we also save
        # the type in a specific property.
        if node.target.id:
            if not node.target.id in self.content:
                self.content[node.target.id] = {"acResult": node.target.id, "type": [], "documentation": "", "version": getMicrobitVersion(self.moduleName, node.target.id)}
                if isinstance(node.annotation, ast.Name) :
                    self.content[node.target.id]["mbVarType"] = node.annotation.id
            self.content[node.target.id]["type"].append("variable")
    def visit_ImportFrom(self, node):
        # Picks up items like "from .microbit.audio import (play as play, ....)"
        if node.module and node.module.startswith("microbit.") :
            for alias in node.names:
                if not alias.asname in self.content:
                    # The microbit.xxx module content would have already be parsed, so we can fetch it                    
                    result = next((obj for obj in found[node.module] if obj["acResult"] == alias.asname), None)
                    self.content[alias.asname] = result if result is not None else {"acResult": alias.asname, "type": ["module"], "documentation": "", "version": 1}                    
        # Picks up items like "from . import compass as compass"
        if node.module is None:
            for alias in node.names:
                if not alias.asname in self.content:
                    self.content[alias.asname] = {"acResult": alias.asname, "type": [], "documentation": "", "version": getMicrobitVersion("microbit",alias.asname)}
                self.content[alias.asname]["type"].append("module")

# Either checkout https://github.com/microbit-foundation/micropython-microbit-stubs or do a git pull if directory exists
repo_path = "temp-scripts/micropython-microbit-stubs"
if os.path.isdir(repo_path):
    subprocess.run(["git", "fetch"], cwd=repo_path)
    subprocess.run(["git", "reset", "--hard", "origin/main"], cwd=repo_path, stdout=subprocess.DEVNULL)
else:
    Path("temp-scripts").mkdir(exist_ok=True)
    subprocess.run(["git", "clone", "https://github.com/microbit-foundation/micropython-microbit-stubs"], cwd="temp-scripts", stdout=subprocess.DEVNULL)

def findSignatureForClassInOldContent(oldContent, className) :
    try:
        if "signature" in oldContent[className] :        
            return oldContent[className]["signature"]
    except:
        return None
    return None

def getDictContentFromList(contentList):   
    dict_res = {};
    for content_entry in contentList :
        dict_res[content_entry["acResult"]] = content_entry
    return dict_res

def getMicrobitVersion(element_path_part1, element_path_part2=None) :
    # This methods runs a check on microbit.json where we had listed which elements of the micro:bit API are v2+
    # everything that is NOT listed in {versions:{...}} of mbDescJson is considered as v1, the default value.
    # We don't list every parts of a module if the whole module is of a specific version: then we stop there.
    element_path = element_path_part1 if element_path_part2 is None else ((element_path_part1 + "." + element_path_part2) if len(element_path_part1) > 0 else element_path_part2)
    versionsData = mbDescJson["versions"]   
    keys = element_path.split(".")
    for key in keys:
        try :
            versionsData = versionsData[key]
            if isinstance(versionsData, int) :
                return versionsData
        except :
            return  1
    # Fallout case: version 1
    return 1
  
    
def processdir(dir, parent):
    files = os.listdir(dir);
    # To avoid issues with re-imported modules from /microbit/ to the root,
    # we make sure we parse /microbit first.
    if "microbit" in files:
        files.remove("microbit")
        files.insert(0, "microbit")
    # and for the same reason, if we are in /microbit we make sure we parse
    # __init__.py last
    if parent == "microbit." :
        files.remove("__init__.pyi")
        files.append( "__init__.pyi")

    for file in files :
        if os.path.isdir(dir + "/" + file):
            processdir(dir + "/" + file, parent + file + ".")
        elif not file.startswith("_") and len(file.split(".")) == 2:
            [stem, ext] = file.split(".")
            if ext == "pyi":
                with open(dir + "/" + file, 'r', encoding="utf-8") as fileHandle:
                    parsed = ast.parse(fileHandle.read())
                    moduleName = parent + stem if parent + stem != "builtins" else ""
                    walker = TreeWalk(moduleName)
                    walker.visit(parsed)
                    found[moduleName] = list(walker.content.values())
                    # Add module to description JSON
                    add_module_in_json_descrition(moduleName, ast.get_docstring(parsed), getMicrobitVersion(moduleName))                    
        elif file == "__init__.pyi" and parent.endswith("."):
            with open(dir + "/" + file, 'r', encoding="utf-8") as fileHandle:
                parsed = ast.parse(fileHandle.read())
                moduleName = parent[:-1]
                walker = TreeWalk(moduleName)
                walker.visit(parsed)
                topLevelDoc = ast.get_docstring(parsed)
                found[moduleName] = list(walker.content.values()) + ([{"acResult": "__doc__", "type": ["module"], "documentation": topLevelDoc, "version": getMicrobitVersion(moduleName)}] if topLevelDoc else [])                  
                # Add module to description JSON
                add_module_in_json_descrition(moduleName, topLevelDoc, getMicrobitVersion(moduleName))

def add_module_in_json_descrition(moduleName, doc, version) :
    if(len(moduleName) > 0) :
        mbDescJson["modules"][moduleName] = {"type": "module", "documentation": doc, "version": version}

# Get and set initial data in the microbit.json file
with open("./src/autocompletion/microbit.json") as mbDescJsonFile :
    # Retrieve the microbit.json content for versions
    mbDescJson =  json.load(mbDescJsonFile)
    # Clear the microbit.json content for modules (so we can write them again when we parse the pyi files)
    # (the expected format of the content is equivalent to Record<string, { type: "module", documentation?: string, version: number })
    mbDescJson["modules"] = {}

# Entry point for getting the micro:bit API stubs from GitHub and parse them
processdir("temp-scripts/micropython-microbit-stubs/lang/en/typeshed/stdlib", "")

# Save the microbit.json for the modules description (versions are kept untouched)
with open("./src/autocompletion/microbit.json", "w") as mbDescJsonFile :
    json.dump(mbDescJson, mbDescJsonFile, indent=4)


# Dump the API JSON description for creating the doc API file
json.dump(found, sys.stdout, indent=4)
