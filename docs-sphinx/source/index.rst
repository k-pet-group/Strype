Available Python libraries in Strype
==================================== 

Strype comes with `almost all <https://pyodide.org/en/0.29.4/usage/wasm-constraints.html>`__ the standard Python functions, as well as its own graphics and sound libraries which are explained below.

Strype also has various popular Python libraries available for use automatically, including scipy, numpy, pandas, and more.  You can see the full list on the `Pyodide web site <https://pyodide.org/en/0.29.4/usage/packages-in-pyodide.html>`__.
Advanced users can use pure-Python libraries with `micropip <https://micropip.pyodide.org/>`__ via a library frame in the imports section (e.g. "micropip:snowballstemmer" in a library frame).

But for most users, the Strype graphics and sound API below is all that is needed; see the documentation below.

Strype API documentation
========================

You can see more documentation for Strype on the `main documentation page <https://strype.org/doc/>`__

Module strype.graphics
----------------------

.. container:: module-wrapper

  .. container:: module-content
      
    The strype.graphics module contains all the classes and functions related to graphical output in Strype.  The central classes are `Image` and `Actor`: `Image` is an editable image of a fixed size, but it only appears on screen if it is used in an `Actor`.  An `Actor` has an X, Y position and a rotation and can move around the screen.  Actors are automatically drawn on the screen in real time; no paint or redraw calls are needed.  To make your program run at a consistent speed you may want to use a `while True` loop with a call to `pace()` which will lead to your code updating regularly.
    
    This module also contains functions related to getting information on keyboard and mouse input.

    .. automodule:: strype.graphics
       :members:
       :undoc-members:
       :show-inheritance:

  .. container:: module-indicator

    Module strype.graphics
    
Module strype.sound
-------------------

.. container:: module-wrapper

  .. container:: module-content
      
    The strype.sound module contains the `Sound` class which allows manipulation and playing of sounds.

    .. automodule:: strype.sound
       :members:
       :undoc-members:
       :show-inheritance:

  .. container:: module-indicator

    Module strype.sound

Module strype.builtins
-------------------

.. container:: module-wrapper

  .. container:: module-content
      
    Note that everything from this module is automatically imported so you should not ever need to import it yourself.  For example, if you want to call `clear_console()` you can just call it, without needing to add an import.
    
    ⚠️The content of this module is only available on the standard version of Strype.

    .. automodule:: strype.builtins
       :members:
       :undoc-members:
       :show-inheritance:

  .. container:: module-indicator

    Module strype.builtins.
    
    


.. toctree::
   :maxdepth: 2
   :caption: Contents:

