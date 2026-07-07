from strype_bridge import strype_graphics_input_internal as _strype_input_internal

def clear_console():
    """
    Clears the console.
    
    All previous output will be cleared (and will not appear in the scroll history either),
    including any errors that might have occurred.
    """
    _strype_input_internal.clearConsole()

def get_connected_cloud():
    # type: () -> str | None
    """
    Use this function to check the Cloud provider name where this Strype project lives.
    (Currently, the Cloud providers Strype supports are `"Google Drive"` and `"Microsoft OneDrive"`.) 

    :return: The name of the Cloud provider where this Strype project lives, `None` if the Strype project does not live on the Cloud.
    """
    return _strype_input_internal.getCurrentCloudName()

