# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html
import os
import sys
# Note: this path command must come before the shared import because otherwise is not located correctly:
sys.path.insert(0, os.path.abspath('.'))
import strype_sphinx_conf_defaults
sys.path.insert(0, os.path.abspath('../../public/public_libraries'))
sys.path.insert(0, os.path.abspath('./_dummy'))


# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = 'Strype'
copyright = '2024-2025, K-PET Group, King\'s College London'
author = 'K-PET Group, King\'s College London'

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

templates_path = ['_templates']
exclude_patterns = []

strype_sphinx_conf_defaults.set_defaults(globals())
