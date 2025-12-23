import strype_graphics_internal as _strype_graphics_internal
import strype_graphics_input_internal as _strype_input_internal
import math as _math
import collections as _collections
import re as _re
import time as _time

# This file is automatically processed to extract types for TigerPython, using the "# type" annotations

# This thread https://stackoverflow.com/questions/1573053/javascript-function-to-convert-color-names-to-hex-codes
# has various slow (round-trip to Javascript, plus either creating
# a div or a canvas) ways to convert color names to RGB, but this is the simplest
# solution:
_color_map = {"aliceblue":"#f0f8ff","antiquewhite":"#faebd7","aqua":"#00ffff","aquamarine":"#7fffd4","azure":"#f0ffff",
                "beige":"#f5f5dc","bisque":"#ffe4c4","black":"#000000","blanchedalmond":"#ffebcd","blue":"#0000ff","blueviolet":"#8a2be2","brown":"#a52a2a","burlywood":"#deb887",
                "cadetblue":"#5f9ea0","chartreuse":"#7fff00","chocolate":"#d2691e","coral":"#ff7f50","cornflowerblue":"#6495ed","cornsilk":"#fff8dc","crimson":"#dc143c","cyan":"#00ffff",
                "darkblue":"#00008b","darkcyan":"#008b8b","darkgoldenrod":"#b8860b","darkgray":"#a9a9a9","darkgreen":"#006400","darkgrey":"#a9a9a9","darkkhaki":"#bdb76b","darkmagenta":"#8b008b","darkolivegreen":"#556b2f", "darkorange":"#ff8c00","darkorchid":"#9932cc","darkred":"#8b0000","darksalmon":"#e9967a","darkseagreen":"#8fbc8f","darkslateblue":"#483d8b","darkslategray":"#2f4f4f","darkslategrey":"#2f4f4f","darkturquoise":"#00ced1", "darkviolet":"#9400d3","deeppink":"#ff1493","deepskyblue":"#00bfff","dimgray":"#696969","dimgrey":"#696969","dodgerblue":"#1e90ff",
                "firebrick":"#b22222","floralwhite":"#fffaf0","forestgreen":"#228b22","fuchsia":"#ff00ff",
                "gainsboro":"#dcdcdc","ghostwhite":"#f8f8ff","gold":"#ffd700","goldenrod":"#daa520","gray":"#808080","green":"#008000","greenyellow":"#adff2f","grey":"#808080",
                "honeydew":"#f0fff0","hotpink":"#ff69b4",
                "indianred ":"#cd5c5c","indigo":"#4b0082","ivory":"#fffff0","khaki":"#f0e68c",
                "lavender":"#e6e6fa","lavenderblush":"#fff0f5","lawngreen":"#7cfc00","lemonchiffon":"#fffacd","lightblue":"#add8e6","lightcoral":"#f08080","lightcyan":"#e0ffff","lightgoldenrodyellow":"#fafad2","lightgray":"#d3d3d3","lightgrey":"#d3d3d3","lightgreen":"#90ee90","lightpink":"#ffb6c1","lightsalmon":"#ffa07a","lightseagreen":"#20b2aa","lightskyblue":"#87cefa","lightslategray":"#778899","lightslategrey":"#778899","lightsteelblue":"#b0c4de", "lightyellow":"#ffffe0","lime":"#00ff00","limegreen":"#32cd32","linen":"#faf0e6",
                "magenta":"#ff00ff","maroon":"#800000","mediumaquamarine":"#66cdaa","mediumblue":"#0000cd","mediumorchid":"#ba55d3","mediumpurple":"#9370d8","mediumseagreen":"#3cb371","mediumslateblue":"#7b68ee", "mediumspringgreen":"#00fa9a","mediumturquoise":"#48d1cc","mediumvioletred":"#c71585","midnightblue":"#191970","mintcream":"#f5fffa","mistyrose":"#ffe4e1","moccasin":"#ffe4b5",
                "navajowhite":"#ffdead","navy":"#000080",
                "oldlace":"#fdf5e6","olive":"#808000","olivedrab":"#6b8e23","orange":"#ffa500","orangered":"#ff4500","orchid":"#da70d6",
                "palegoldenrod":"#eee8aa","palegreen":"#98fb98","paleturquoise":"#afeeee","palevioletred":"#d87093","papayawhip":"#ffefd5","peachpuff":"#ffdab9","peru":"#cd853f","pink":"#ffc0cb","plum":"#dda0dd","powderblue":"#b0e0e6","purple":"#800080",
                "rebeccapurple":"#663399","red":"#ff0000","rosybrown":"#bc8f8f","royalblue":"#4169e1",
                "saddlebrown":"#8b4513","salmon":"#fa8072","sandybrown":"#f4a460","seagreen":"#2e8b57","seashell":"#fff5ee","sienna":"#a0522d","silver":"#c0c0c0","skyblue":"#87ceeb","slateblue":"#6a5acd","slategray":"#708090","snow":"#fffafa","springgreen":"#00ff7f","steelblue":"#4682b4",
                "tan":"#d2b48c","teal":"#008080","thistle":"#d8bfd8","tomato":"#ff6347","turquoise":"#40e0d0",
                "violet":"#ee82ee",
                "wheat":"#f5deb3","white":"#ffffff","whitesmoke":"#f5f5f5",
                "yellow":"#ffff00","yellowgreen":"#9acd32"}
# type: dict[str, str]

def _round_and_clamp_0_255(number):
    # type: (float) -> int
    return min(max(int(round(number)), 0), 255)

_bk_image = None
#type: Image | None

def color_from_string(html_string):
    # type: (str) -> Color
    """
    Convert a string to a :class:`Color` object.  The string can be either a color name (e.g. "red") or a 
    hex string (e.g. "#ff0000").  A hex string can either be 6 hex digits (in which case alpha is assumed to be 255)
    or 8 hex digits (which includes the alpha).
    
    :param html_string: A string as described above.
    :raises ValueError: If the string is not recognised as a color name or valid 6 or 8 digit hex string.
    :return: A :class:`Color` object.
    """
    if html_string.lower() in _color_map:
        html_string = _color_map[html_string.lower()]
    # Now it's hex or unrecognised:
    if not html_string.startswith("#"):
        raise ValueError(f"Color \"{html_string} is not a known color name and does not start with a \"#\"")
    html_string = html_string.lstrip('#')

    if len(html_string) == 6:  # RGB format (without alpha)
        r, g, b = (int(html_string[i:i+2], 16) for i in (0, 2, 4))
        a = 255  # Default alpha if omitted
    elif len(html_string) == 8:  # RGBA format
        r, g, b, a = (int(html_string[i:i+2], 16) for i in (0, 2, 4, 6))
    else:
        raise ValueError("Hex string should have either 6 or 8 digits")

    return Color(r, g, b, a)

class Color:
    """
    A Color class with red, green, blue components, and an optional alpha value. 
    """
    def __init__(self, red, green, blue, alpha = 255):
        # type: (int, int, int, int) -> None
        """
        Create a color object with red, green, blue and alpha (transparency) values. Parameters are in the range 0--255. Parameters below 0 they will be 
        treated as 0; parameters above 255 will be treated as 255.
        
        :param red: The red value, from 0 (none) to 255 (most).
        :param green: The green value, from 0 (none) to 255 (most).
        :param blue: The blue value, from 0 (none) to 255 (most). 
        :param alpha: The alpha value.  0 is fully transparent (invisible).  255 is fully opaque.
        """
        self.red = _round_and_clamp_0_255(red)
        self.green = _round_and_clamp_0_255(green)
        self.blue = _round_and_clamp_0_255(blue)
        self.alpha = _round_and_clamp_0_255(alpha)

    def _to_html(self):
        # type: () -> str
        """
        Get the HTML version of this Color, in the format #RRGGBBAA where each pair is 2 hexadecimal digits.
        
        :return: The HTML version of this Color as string.
        """
        r = _round_and_clamp_0_255(self.red)
        g = _round_and_clamp_0_255(self.green)
        b = _round_and_clamp_0_255(self.blue)
        a = _round_and_clamp_0_255(self.alpha)
        return "#{:02x}{:02x}{:02x}{:02x}".format(r, g, b, a)

_Dimension = _collections.namedtuple("Dimension", ["width", "height"])

class Image:
    """
    An editable image of fixed width and height.
    """

    # Attributes:
    # __image: A Javascript OffscreenCanvas, but from the Python end it is only
    #          passed back to Javascript calls.

    # Tracks the rate limiting for downloads:
    __last_download = _time.time()
    # type: float


    def __init__(self, width, height):
        # type: (int, int) -> None
        """
        Create an editable image with the given dimensions. The initial image is empty (fully transparent).
        For reference: the size of the Strype graphics world is 800x600 pixels.
        
        :param width: The width of the image in pixels.
        :param height: The height of the image in pixels.
        """

        # Note: for internal purposes we sometimes don't want to make an image, so we pass -1,-1 for that case:
        if width >= 1 and height >= 1:
            self.__image = _strype_graphics_internal.makeCanvasOfSize(width, height)
            self.clear()
            _strype_graphics_internal.canvas_setFill(self.__image, "white")
            _strype_graphics_internal.canvas_setStroke(self.__image, "black")
        elif width == -42 and height == -42:
            # Magic constants used elsewhere in the code to mean make it empty for now.
            self.__image = None
        else:
            raise ValueError("Invalid image size: " + str(width) + " * " + str(height))

    def fill(self):
        # type: () -> None
        """
        Fill the image with the current fill color (see `set_fill`).
        """
        dim = _strype_graphics_internal.getCanvasDimensions(self.__image)
        _strype_graphics_internal.canvas_fillRect(self.__image, 0, 0, dim[0], dim[1])

    def set_fill(self, color):
        # type: (str | Color | None) -> None
        """
        Set the current fill color.  The fill color is used in subsequent fill and draw operations.  
        Set the fill color to None to draw shape outlines without filling.
        
        :param fill: The color to use for filling.  It can be either an HTML color name (e.g. "magenta"), an HTML hex string (e.g. "#ff00c0"), a :class:`Color` object, or None.
        """
        if isinstance(color, Color):
            _strype_graphics_internal.canvas_setFill(self.__image, color._to_html())
        elif isinstance(color, str) or color is None:
            _strype_graphics_internal.canvas_setFill(self.__image, color)
        else:
            raise TypeError("Fill must be either a string or a Color but was " + str(type(color)))

    def set_stroke(self, color):
        # type: (str | Color | None) -> None
        """
        Set the current stroke (line) color.  This color is used in subsequent draw operations for the shape's outline.
        Set the stroke color to None to paint shapes without a separately colored border.
        
        :param fill: The color to use for drawing.  It can be either an HTML color name (e.g. "magenta"), an HTML hex string (e.g. "#ff00c0"), a :class:`Color` object, or None.
        """
        if isinstance(color, Color):
            _strype_graphics_internal.canvas_setStroke(self.__image, color._to_html())
        elif isinstance(color, str) or color is None:
            _strype_graphics_internal.canvas_setStroke(self.__image, color)
        else:
            raise TypeError("Stroke must be either a string or a Color but was " + str(type(color)))

    def get_pixel(self, x, y):
        # type: (int, int) -> Color
        """
        Return a :class:`Color` object representing the color of the pixel at the given position.
        
        :param x: The x coordinate within the image, in pixels.
        :param y: The y coordinate within the image, in pixels.
        :return: A :class:`Color` object with the color of the given pixel.
        """
        rgba = _strype_graphics_internal.canvas_getPixel(self.__image, int(x), int(y))
        return Color(rgba[0], rgba[1], rgba[2], rgba[3])

    def set_pixel(self, x, y, color):
        # type: (int, int, Color) -> None
        """
        Set the pixel at the given position to a specific color.
        
        :param x: The x coordinate of the pixel (must be an integer).
        :param y: The y coordinate of the pixel (must be an integer).
        :param color: The color to use.  The color can be either an HTML color name (e.g. "magenta"), an HTML hex string (e.g. "#ff00c0"), or a :class:`Color` object.
        """
        if isinstance(color, str):
            color = color_from_string(color)
        
        _strype_graphics_internal.canvas_setPixel(self.__image, x, y, (color.red, color.green, color.blue, color.alpha))

    def _bulk_get_pixels(self):
        # type: () -> list[int]
        """
        Gets the values of the pixels of the image in one large array.  Index 0 in the array is the red value,
        of the pixel at the top-left (0,0) in the image.  Indexes 1, 2 and 3 are the green, blue and alpha of that pixel.
        Index 4 is the red value of the pixel at (1, 0) in the image.  So the values are sets of four (RGBA in that order)
        for each pixel, and at the end of the first row it starts at the left of the second row.
        
        :return: An array of 0-255 values organised as described above.
        """
        return _strype_graphics_internal.canvas_getAllPixels(self.__image)

    def _bulk_set_pixels(self, rgba_array):
        # type: (list[int]) -> None
        """
        Sets the values of the pixels from RGBA values in one giant array.  The pixels should be arranged as described
        in `_bulk_get_pixels()`.  The array should thus be of length width * height * 4.
        
        :param rgba_array: An array of 0-255 RGBA values organised as described above.
        """
        _strype_graphics_internal.canvas_setAllPixelsRGBA(self.__image, rgba_array)

    def clear(self):
        # type: () -> None
        """
        Clears the image (i.e. sets all the pixels to be fully transparent).
        """
        _strype_graphics_internal.canvas_clearRect(self.__image, 0, 0, self.get_width(), self.get_height())

    def draw_image(self, image, x, y):
        # type: (Image, int, int) -> None
        """
        Draw another image onto this image. 
        
        :param image: The image to draw.  This must be of type :class:`Image`.
        :param x: The x coordinate for the top left corner of the image to draw.
        :param y: The y coordinate for the top left corner of the image to draw.
        """
        dim = _strype_graphics_internal.getCanvasDimensions(image._Image__image)
        _strype_graphics_internal.canvas_drawImagePart(self.__image, image._Image__image, x, y, 0, 0, dim[0], dim[1], 1.0)

    def _draw_part_of_image(self, image, x, y, sx, sy, width, height, scale = 1.0):
        # type: (Image, int, int, int, int, int, int, float) -> None
        """
        Draws part of the given image into this image.
        
        :param image: The image to draw from, into this image.  Must be an Image.
        :param x: The left X coordinate to draw the image at.
        :param y: The top Y coordinate to draw the image at.
        :param sx: The left X coordinate within the source image to draw from.
        :param sy: The top Y coordinate within the source image to draw from.
        :param width: The width of the area to draw from.
        :param height: The height of the area to draw from.
        :param scale: The scale of the image (1.0 is original size, higher values result in drawing a larger version).
        """
        _strype_graphics_internal.canvas_drawImagePart(self.__image, image._Image__image, x, y, sx, sy, width, height, scale)

    def get_width(self):
        # type: () -> int
        """
        Return the width of this image.
        
        :return: The width of this image, in pixels. 
        """
        return _strype_graphics_internal.getCanvasDimensions(self.__image)[0]

    def get_height(self):
        # type: () -> int
        """
        Return the height of this image.
        
        :return: The height of this image, in pixels. 
        """
        return _strype_graphics_internal.getCanvasDimensions(self.__image)[1]

    def draw_text(self, text, x, y, font_size = 32, max_width = 0, max_height = 0, font_family = None):
        # type: (str, float, float, float, float, float, str | None) -> _Dimension
        """
        Draw text onto the image.  If a maximum width is specified, the text will be wrapped to fit the given width.  
        If a maximum height is specified as well, the font size will be reduced if necessary to fit within the width and height.  
        If the text is too long, it may exceed the maximum width or height.
        
        The text color is the current fill color (see `set_fill()`). 
        
        :param text: The text to draw.
        :param x: The x coordinate of the top-left corner of the text.
        :param y: The y coordinate of the top-left corner of the text.
        :param font_size: The size of the text, in pixels.
        :param max_width: The maximum width of the text (or 0 for no maximum).
        :param max_height: The maximum height of the text (or 0 for no maximum).
        :return: A named tuple width width and height of the actually drawn area.
        """
        if font_family is not None:
            font_family = _strype_graphics_internal.canvas_loadFont("google", font_name)
            if not font_family:
                raise Exception("Could not load font " + font_name)
        dim = _strype_graphics_internal.canvas_drawText(self.__image, text, x, y, font_size, max_width, max_height, font_family)
        return _Dimension(dim['width'], dim['height'])
        
    def draw_rounded_rect(self, x, y, width, height, corner_size = 10):
        # type: (float, float, float, float, float) -> None
        """
        Draw a rectangle with rounded corners.  The border is drawn using the stroke color (see `set_stroke`) 
        and filled using the current fill color (see `set_fill`).
        
        :param x: The x coordinate of the top-left of the rectangle.
        :param y: The y coordinate of the top-left of the rectangle.
        :param width: The width of the rectangle.
        :param height: The height of the rectangle.
        :param corner_size: The radius of the rounded corners of the rectangle.  Defaults to 10 if omitted.
        """
        _strype_graphics_internal.canvas_roundedRect(self.__image, x, y, width, height, corner_size)
        
    def draw_rect(self, x, y, width, height):
        # type: (float, float, float, float) -> None
        """
        Draw a rectangle.  The border is drawn using the stroke color (see `set_stroke`) 
        and filled using the current fill color (see `set_fill`).
        
        :param x: The x coordinate of the top-left of the rectangle.
        :param y: The y coordinate of the top-left of the rectangle.
        :param width: The width of the rectangle.
        :param height: The height of the rectangle.
        """
        _strype_graphics_internal.canvas_roundedRect(self.__image, x, y, width, height, 0)
        
    def draw_line(self, start_x, start_y, end_x, end_y):
        # type: (float, float, float, float) -> None
        """
        Draw a line.  The line is drawn in the current stroke color.
        
        :param start_x: The starting x coordinate.
        :param start_y: The starting y coordinate.
        :param end_x: The end x coordinate.
        :param end_y: The end y coordinate.
        """
        _strype_graphics_internal.canvas_line(self.__image, start_x, start_y, end_x, end_y)
        
    def draw_oval(self, centre_x, centre_y, x_radius, y_radius, angle_start = 0, angle_amount = 360):
        # type: (float, float, float, float, float, float) -> None
        """
        Draws an oval or part of one (also known as an ellipse; a circle with a width that can be different than height).
        
        If you want to draw part of an oval, pass the last two parameters.
        Imagine an oval with a given centre position and X/Y radius.  The `angle_start` parameter
        is the angle from the centre to the start of the arc, in degrees (0 points to the right, positive values go clockwise),
        and the `angle_amount` is the amount of degrees to travel (positive goes clockwise, negative goes anti-clockwise) to
        the end point.
        
        The oval will be filled with the current fill (see `set_fill()`) and drawn in the current stroke (see `set_stroke()`).
        
        :param centre_x: The centre x coordinate of the oval.
        :param centre_y: The centre y coordinate of the oval.
        :param x_radius: The radius of the oval on the X axis.
        :param y_radius: The radius of the oval on the Y axis.
        :param angle_start: The starting angle of the arc, in degrees (0 points to the right).
        :param angle_amount: The amount of degrees to travel (positive goes clockwise).
        """
        _strype_graphics_internal.canvas_arc(self.__image, centre_x, centre_y, x_radius, y_radius, angle_start, angle_amount)

    def draw_circle(self, centre_x, centre_y, radius):
        # type: (float, float, float) -> None
        """
        Draw a circle at a given position.  The border is drawn using the stroke color (see `set_stroke`) 
        and filled using the current fill color (see `set_fill`).
        
        :param centre_x: The x coordinate of the centre of the circle.
        :param centre_y: The y coordinate of the centre of the circle.
        :param radius: The radius of the circle.
        """
        self.draw_oval(centre_x, centre_y, radius, radius)

    def draw_polygon(self, points):
        # type: (list[tuple[float, float]]) -> None
        """
        Draw a polygon with the given corner points.  The last point will be connected to the first point to close the polygon.
        
        The border is drawn using the stroke color (see `set_stroke`) and filled using the current fill color (see `set_fill`).  
        The polygon should be convex, otherwise the visual behaviour is undefined.
        
        :param points: A list of pairs of (x, y) coordinates.
        """
        _strype_graphics_internal.polygon_xy_pairs(self.__image, points)

    def clone(self, scale = 1.0):
        # type: (float) -> Image
        """
        Return a copy of this image.
        
        :param: The scaling factor of the new image.  1.0 returns an identical image,
                0.5 will return an image half the size, 2.0 will return an image double the size.
        :return: The new :class:`Image` that is a copy of this image.
        """
        if scale == 1:
            copy = Image(self.get_width(), self.get_height())
            copy.draw_image(self, 0, 0)
        elif scale <= 0:
            raise ValueError("Clone scale must be greater than zero")
        else:
            copy = Image(self.get_width() * scale, self.get_height() * scale)
            copy._draw_part_of_image(self, 0, 0, 0, 0, self.get_width(), self.get_height(), scale)
        return copy

    def download(self, filename="strype-image"):
        # type: (str) -> None
        """
        Triggers a download of this image as a PNG image file.  You can optionally
        pass a file name (you do not need to include the file extension, Strype
        will add that automatically).  To help you distinguish downloads
        from repeated runs, Strype will automatically add a timestamp to the file.
        
        To avoid problems with accidentally calling this method too often, Strype
        will limit the rate of downloads to at most one every 2 seconds.
        
        :param filename: The main part of the filename to use for the downloaded file.
        """
        # We add a kind of rate limiter for downloads.  This is not necessary from a technical perspective,
        # but imagine the user accidentally puts their download inside a tight loop; they may trigger the
        # download of 100 files before they realised what has happened.  I'm not sure if browsers will
        # protect against this.  So we protect against this by limiting downloads to only happening every
        # 2 seconds.  It's easier to do this on the Python side than on the Javascript side (where we'd have
        # to mess with promises and Skulpt suspensions.  This is already wrapped up into the Python time
        # module anyway:        
        now = _time.time()
        # If it's less than 2 seconds since last download, wait:
        if now < Image.__last_download + 2:
            _time.sleep(Image.__last_download + 2 - now)
        _strype_graphics_internal.canvas_downloadPNG(self.__image, filename)
        Image.__last_download = _time.time()

class Actor:
    """
    An Actor is an item in the world with a specific image, position, rotation and scale.  If an actor is created,
    it becomes visible in the graphics world. 
    """
    
    # Private attributes:
    # __id: the identifier of the PersistentImage that represents this actor on screen.  Should never be None
    # __editable_image: the editable image of this actor, if the user has ever called get_image() on us.
    # __tag: the user-supplied tag of the actor.  Useful to leave the type flexible, we just pass it in and out.
    # __say: the identifier of the PersistentImage with the current speech bubble for this actor.  Is None when there is no current speech.
    # Note that __say can be removed on the Javascript side without our code executing, due to a timeout.  So
    # whenever we use it, we should check it's still actually present.
    
    def __init__(self, image, x = 0, y = 0, tag = None):
        # type: (Image, float, float, Any | None) -> None
        """
        Create a new Actor.  An actor has an image and a location.  It can optionally have a tag.  A tag (usually a string) 
        can be used to group actors and identify them later for collision detection.
        
        The image parameter must be an :class:`Image` object.

        The (x, y) coordinate determines the location of the actor.  The graphics world coordinate system has x coordinates from -400 to 400, 
        and y coordinates from -300 to 300.  The origin (0, 0) point is in the center; (-400, -300) is the bottom left.
        
        :param image: An :class:`Image` object.
        :param x: The x coordinate at which to place the actor.
        :param y: The y coordinate at which to place the actor.
        :param tag: A optional tag for the actor (usually a string) for use in detecting touching actors.
        """
        if isinstance(image, Image):
            self.__id = _strype_graphics_internal.addImage(image._Image__image, self)
            self.__editable_image = image
        elif isinstance(image, str):
            self.__id = _strype_graphics_internal.addImage(_strype_graphics_internal.loadAndWaitForImage(image), self)
            self.__editable_image = None
        else:
            raise TypeError("Actor constructor parameter must be Image")
        self.__say = None
        self.__tag = tag
        _strype_graphics_internal.setImageLocation(self.__id, x, y)
        _strype_graphics_internal.setImageRotation(self.__id, 0)
        
    def set_location(self, x, y):
        # type: (float, float) -> None
        """
        Set the location of the actor.
        
        If the location is outside the bounds of the world, it
        will be adjusted to the nearest point inside the world.
        
        :param x: The new x coordinate of the actor.
        :param y: The new y coordinate of the actor.
        """
        _strype_graphics_internal.setImageLocation(self.__id, x, y)
        self._update_say_position()
        
    def set_rotation(self, degrees):
        # type: (float) -> None
        """
        Set the rotation of the actor.  This changes the rotation of the actor's image, and it also affects 
        the direction of movement when `move()` is called.
        
        :param degrees: The rotation in degrees (0 points right, 90 points up, 180 points left, 270 points down).
        """
        _strype_graphics_internal.setImageRotation(self.__id, degrees)
        # Note: no need to update say position if we are just rotating
                
    def get_rotation(self):
        # type: () -> float
        """
        Return the current rotation of this actor.
        
        :return: The rotation of this Actor, in degrees, or None if the actor has been removed from the world.
        """
        return _strype_graphics_internal.getImageRotation(self.__id)
    
    def get_tag(self):
        # type: () -> Any | None
        """
        Return the tag of this actor.
        
        :return: The tag, as set during the creation of this actor.
        """
        return self.__tag
    
    def remove(self):
        # type: () -> None
        """
        Remove the actor from the world.  Once an actor has been removed, it cannot be re-added to the world.
        """
        _strype_graphics_internal.removeImage(self.__id)
        # Also remove any speech bubble:
        self.say("")

    def get_x(self):
        # type: () -> int
        """
        Return the x coordinate of the actor as an integer (whole number).  If the actor's exact position
        is not a whole number, it is rounded down (towards zero).  To receive the exact position as a potentially
        fractional number, call `get_exact_x()`.
        
        :return: The current x coordinate, as an integer, or None if the actor has been removed from the world.
        """
        
         # Gets X with rounding (towards zero):
        location = _strype_graphics_internal.getImageLocation(self.__id)
        return int(location['x']) if location else None

    def get_y(self):
        # type: () -> int
        """
        Return the y coordinate of the actor as an integer (whole number).  If the actor's exact position
        is not a whole number, it is rounded down (towards zero).  To receive the exact position as a potentially
        fractional number, call `get_exact_y()`.
        
        :return: The current y coordinate, as an integer, or None if the actor has been removed from the world.
        """
        # Gets Y with rounding (towards zero):
        location = _strype_graphics_internal.getImageLocation(self.__id)
        return int(location['y']) if location else None

    def get_exact_x(self):
        # type: () -> float
        """
        Return the exact x coordinate of the actor, which may be a fractional number.  For simpler coordinate calculations
        using whole numbers, call `get_x()` instead.
        
        :return: The exact x coordinate, or None if the actor has been removed from the world.
        """
        # Gets X with no rounding:
        location = _strype_graphics_internal.getImageLocation(self.__id)
        return location['x'] if location else None

    def get_exact_y(self):
        # type: () -> float
        """
        Return the exact y coordinate of the actor, which may be a fractional number.  For simpler coordinate calculations
        using whole numbers, call `get_y()` instead.
         
        :return: The exact y coordinate, or None if the actor has been removed from the world.
        """
        # Gets Y with no rounding:
        location = _strype_graphics_internal.getImageLocation(self.__id)
        return location['y'] if location else None
    
    def move(self, distance):
        # type: (float) -> None
        """
        Move forward the given distance in the current direction.  The direction of travel can be changed using 
        `set_rotation()` or `turn()`.
        
        Actors are stopped at the edge of the world -- they cannot move outside of the world.
        
        :param distance: The distance to move (in pixels).  Negative amounts move backwards.
        """
        cur = _strype_graphics_internal.getImageLocation(self.__id)
        if cur is not None:
            rot = _math.radians(_strype_graphics_internal.getImageRotation(self.__id))
            self.set_location(cur['x'] + distance * _math.cos(rot), cur['y'] + distance * _math.sin(rot))
        # If cur is None, do nothing
    
    def turn(self, degrees):
        # type: (float) -> None
        """
        Change the actor's current rotation by turning a given amount of degrees.
        
        :param degrees: The amount to turn.  Positive amounts turn anti-clockwise, negative amounts turn clockwise.
        """
        rotation = _strype_graphics_internal.getImageRotation(self.__id)
        if rotation is not None:
            self.set_rotation(rotation + degrees)
        # If rotation is None, do nothing

    def is_at_edge(self, distance = 2):
        # type: (float) -> bool
        """
        Check whether the actor is at the edge of the world.  An actor is considered to be at the edge 
        if its location (its center point) is within `distance` pixels of the world bounds.
        
        :param distance: The amount of pixels to use as edge of world.  Must be greater than zero.
        :return: True if the actor is within `distance` pixels of the edge of the world, False otherwise. 
        """
        x = self.get_exact_x()
        y = self.get_exact_y()
        if x is None or y is None:
            return False
        return x < (-399 + distance) or x > (400 - distance) or y < (-299 + distance) or y > (300 - distance)
   
    def is_touching(self, actor_or_tag):
        # type: (Actor | Any) -> bool
        """
        Check if this actor is touching the another actor.
        
        Two actors are deemed to be touching if the bounding rectangles of their images are 
        overlapping (even if the actor is transparent at that point).
        
        The parameter can be either a specific actor (of type :class:`Actor`) or a tag.  If a tag is used,
        this function will return True if any actor with this tag is touched.
        
        :param actor_or_tag: The actor (or tag of an actor) to check for overlap.
        :return: True if this actor overlaps that actor (or an actor with the given tag), False if it does not.
        """
        if isinstance(actor_or_tag, Actor):
            return _strype_input_internal.checkCollision(self.__id, actor_or_tag.__id)
        else:
            # All other types are assumed to be a tag:
            # Slightly odd construct but we convert list (implicitly boolean) to explicitly boolean:
            return True if self.get_all_touching(actor_or_tag) else False

    def get_touching(self, tag = None):
        # type: (Any | None) -> Actor | None
        """
        Return an actor touching this one.  

        If more than one actor is touching this one, a random one of these actors will be returned. If a tag is
        passed as a parameter, only actors with that tag will be considered.
                
        Two actors are deemed to be touching if the bounding rectangles of their images are 
        overlapping (even if the actor is transparent at that point).
        
        :param tag: The tag of the actor to check for touching, or None to check all actors.
        :return: The :class:`Actor` we are touching, if any, or None if we are not touching any actor. 
        """
        return next(iter(self.get_all_touching(tag)), None)

    def get_all_touching(self, tag = None):
        # type: (Any | None) -> list[Actor]
        """
        Return all the actors that this actor is touching.
        
        If the tag is specified, only actors with the given tag will be included.
        
        :param tag: The tag to use to filter the returned actors (or None to return all actors)
        :return: A list of all touching actors.
        """
        return [a for a in _strype_input_internal.getAllTouchingAssociated(self.__id) if tag is None or tag == a.get_tag()]
    
    def remove_touching(self, tag = None):
        # type: (Any | None) -> None
        """
        Remove a touching actor. 

        If this actor is not currently touching another actor, do nothing.  If this actor currently touches more than one
        actor, one random actor currently toouching is removed.  If a tag is specified, only actors with the given tag will
        be removed.
        
        :param tag:  The tag to use to filter the actors (or None to consider all actors)
        """
        a = self.get_touching(tag)
        if a is not None:
            a.remove()

    def get_in_range(self, distance, tag = None):
        # type: (float, Any | None) -> list[Actor]
        """
        Return all actors which are within a given distance of this actor.  The distance is measured as the 
        distance of the logical location (the center point) of each actor.
        
        If a tag is specified, only actors with the given tag will be returned.
        
        :param distance: The maximum distance to look for other actors.
        :param tag: The tag to use to filter the actors (or None to consider all actors)
        :return: A list of all actors within a given range.
        """
        return [a for a in _strype_input_internal.getAllNearbyAssociated(self.__id, distance) if tag is None or tag == a.get_tag()]

    def get_image(self):
        # type: () -> Image
        """
        Return the image of this actor.  The image object returned is the actual actor's live image -- drawing on it will 
        become visible on the actor's image.
        
        :return: The actor's :class:`Image`.
        """
        # Note: we don't want to have an editable image by default because it is slower to render
        # the editable canvas than to render the unedited image (I think!?)
        # That is, if you load an image from a file it's kept internally as an HTML Image,
        # but if you call get_image() we turn it into an off-screen canvas so that it can be edited.
        if self.__editable_image is None:
            # The -42, -42 sizing indicates we will set the image ourselves afterwards:
            self.__editable_image = Image(-42, -42)
            self.__editable_image._Image__image = _strype_graphics_internal.makeImageEditable(self.__id) 
        return self.__editable_image
    
    def set_image(self, image):
        # type: (Image) -> None
        """
        Set an actor's image
        
        The image parameter must be an :class:`Image` object.
        :param image: An :class:`Image` object.
        """
        if isinstance(image, Image):
            _strype_graphics_internal.updateImage(self.__id, image._Image__image)
            self.__editable_image = image
        elif isinstance(image, str):
            _strype_graphics_internal.updateImage(self.__id, _strype_graphics_internal.loadAndWaitForImage(image))
            self.__editable_image = None
        else:
            raise TypeError("Actor image parameter must be Image")
    
    def say(self, text, font_size = 24, max_width = 300, max_height = 200, font_family = None):
        # type: (str, float, float, float, str | None) -> None
        """
        Show a speech bubble next to the actor with the given text.  The only required parameter is the
        text, all others are optional.  \\n can be used to start a new line.
        
        If a maximum width is specified, the text will be wrapped to fit the given width.  
        If a maximum height is specified as well, the font size will be reduced if necessary to fit within 
        the width and height.  If the text is too long, it may exceed the maximum width or height. 

        To remove the speech bubble, call `say("")` (that is, with an empty string).  See also
        `say_for` to display text for a fixed time.
        
        :param text: The text to be shown.  
        :param font_size: The preferred font size.
        :param max_width: The maximum width to fit the text (or 0 for no maximum.).
        :param max_height: The maximum height of the text (or 0 for no maximum).
        """
        
        # Remove any existing speech bubble:
        if self.__say is not None and _strype_graphics_internal.imageExists(self.__say):
            _strype_graphics_internal.removeImage(self.__say)
            self.__say = None
        # Then add a new one if text is not blank and we are in the world:
        if text and _strype_graphics_internal.imageExists(self.__id):
            padding = 10
            # We first make an image just with the text on, which also tells us the size:
            textOnlyImg = Image(max_width, max_height)
            textOnlyImg.set_fill("white")
            textOnlyImg.fill()
            textOnlyImg.set_fill("black")
            textDimensions = textOnlyImg.draw_text(text, 0, 0, font_size, max_width, max_height, font_family)
            # Now we prepare an image of the right size plus padding:
            sayImg = Image(textDimensions.width + 2 * padding, textDimensions.height + 2 * padding)
            # We draw a rounded rect for the background, then draw the text on:
            sayImg.set_fill("white")
            sayImg.set_stroke("#555555FF")
            sayImg.draw_rounded_rect(2, 2, textDimensions.width + 2 * padding - 4, textDimensions.height + 2 * padding - 4, padding)
            sayImg._draw_part_of_image(textOnlyImg, padding, padding, 0, 0, textDimensions.width, textDimensions.height)
            # Note: we used to pass None for associated object, but None is a non-null Javascript Skulpt object wrapping a null value
            # To make this object outside of collisions entirely, we just omit the second parameter:
            self.__say = _strype_graphics_internal.addImage(sayImg._Image__image)
            self._update_say_position()
            
    def _update_say_position(self):
        # type: () -> None
        # Update the speech bubble position to be relative to our new position and scale:
        if self.__say is not None and _strype_graphics_internal.imageExists(self.__say):
            say_dim = _strype_graphics_internal.getImageSize(self.__say)
            our_dim = _strype_graphics_internal.getImageSize(self.__id)
            scale = _strype_graphics_internal.getImageScale(self.__id)
            width = our_dim['width'] * scale
            height = our_dim['height'] * scale
            # Based on where speech bubbles generally appear, we try the following in order:
            placements = [
                    [1, 1],  # Above right
                    [-1, 1], # Above left
                    [0, 1],  # Above centered
                    [1, 0],  # Right
                    [-1, 0], # Left
                    [1, -1], # Below right
                    [-1, -1],# Below left
                    [-1, 0], # Below
                    [0, 0],  # Centered
                ]
            for p in placements:
                # Note, we halve the width/height of the actor because we're going from centre of actor,
                # but we do not halve the width/height of the say here because we want to see if the whole bubble fits:
                poss_x = self.get_x() + p[0]*(width/2 + say_dim['width'])
                poss_y = self.get_y() + p[1]*(height/2 + say_dim['height'])
                fits = poss_x >= -399 and poss_x <= 400 and poss_y >= -299 and poss_y <= 300
                # If it fits or its our last fallback:
                if fits or p == [0,0] :
                    # Here we do halve both widths/heights because we are placing the centre:
                    _strype_graphics_internal.setImageLocation(self.__say, self.get_x() + p[0]*(width/2 + say_dim['width']/2), self.get_y() + p[1]*(height/2 + say_dim['height']/2))
                    break
        else:
            self.__say = None

    def say_for(self, text, seconds, font_size = 24, max_width = 300, max_height = 200):
        # type: (str, float, float, float, float) -> None
        """
        `say_for` acts like the `say` function, but automatically removes the speech bubble after the given number of seconds.  
        For all other parameters, see the `say` function for an explanation.
        
        :param text: The text to be shown.  
        :param seconds: The number of seconds to show the text for.
        :param font_size: The preferred font size.
        :param max_width: The maximum width to fit the text (or 0 for no maximum.).
        :param max_height: The maximum height of the text (or 0 for no maximum).
        """
        self.say(text, font_size, max_width, max_height)
        _strype_graphics_internal.removeImageAfter(self.__say, seconds)

def load_image(name):
    # type: (str) -> Image
    """
    Load the given image and return it as an :class:`Image` object.  The image name must be the name of one of the images
    in the Strype image library.
    
    :param name: The nameof the image to load, as shown in the Strype image library.
    :return: An :class:`Image` object with the library image.
    """
    # If they mistakenly try to load an image (e.g. a literal) just let it through:
    if isinstance(name, Image):
        return name
    # Make an internal empty image then load it:
    img = Image(-42, -42)
    img._Image__image = _strype_graphics_internal.htmlImageToCanvas(_strype_graphics_internal.loadAndWaitForImage(name))
    return img

def get_clicked_actor():
    # type: () -> Actor | None
    """
    Return the last actor receiving a mouse click.  If no actor was clicked since this function was last called, None is returned.
    Every click will be reported only once -- a second call to this function in quick succession will return None.
    
    :return: The most recently clicked :class:`Actor`, or None if no actor was clicked since the last call.
    """
    return _strype_input_internal.getAndResetClickedItem()

_ClickDetails = _collections.namedtuple("ClickDetails", ["x", "y", "button", "click_count"])

def get_mouse_click():
    # type: () -> _ClickDetails | None
    """
    Get the details for the last mouse click.  If the mouse was not clicked since this function was last called, None is returned.
    Every click will be reported only once -- a second call to this function in quick succession will return None.
    
    This function is independent of `get_clicked_actor()`; they will potentially report details of the same mouse click it was on an actor.
    
    :return: A named tuple with details of the last click: `(x, y, button, click_count)` where button is 0 for primary (left), 1 for secondary (right) or 2 for middle; or None if the mouse was not clicked since the last call.
    """
    c = _strype_input_internal.getAndResetClickDetails()
    if c is None:
        return None
    else:
        return _ClickDetails(c[0], c[1], c[2], c[3])

_MouseDetails = _collections.namedtuple("MouseDetails", ["x", "y", "button0", "button1", "button2"])

def get_mouse():
    # type: () -> _MouseDetails
    """
    Get the details for current mouse state.
    
    :return: A named tuple with details of the mouse state: `(x, y, button0, button1, button2)` where the last three items are booleans where True indicates the button is held: button0 for primary (left), button1 for secondary (right), button2 for middle.
    """
    c = _strype_input_internal.getMouseDetails()
    return _MouseDetails(c[0], c[1], c[2][0], c[2][1], c[2][2])


def key_pressed(keyname):
    # type: (str) -> bool
    """
    Check if a given key is currently pressed down.

    The names of printable keys are the character they print (e.g. "a" for the a-key). Other keys have names 
    describing their function. These include "left", "right", "up, "down", "enter", "tab", "escape", "shift", 
    "control", "alt", "backspace", delete".
    
    :param keyname: The name of the key to check.
    :return: True if the key is currently pressed down, False otherwise.
    """
    return _collections.defaultdict(lambda: False, _strype_input_internal.getPressedKeys())[keyname.lower()]

def set_background(image_or_color, scale_to_fit = False):
    # type: (Image | str, bool) -> None
    """
    Set the current background image.
    
    The parameter can be an :class:`Image`, a :class:`Color`, or a color name or hex string.
    
    If scale_to_fit is True, the image will be scaled (up or down) so that it fills the world area (800x600 pixels).  
    Otherwise the image will be drawn in the center of the world in its original size, and tiled outwards
    if it is smaller than the world.
    
    The background image is always copied when it is created, so later changes to the original image will not be 
    shown in the world.  You can call `get_background()` to receive the actual background image object to change it.
    
    :param image_or_color: An :class:`Image`, a :class:`Color` object, or a color name or hex string.
    :param scale_to_fit: If True, scale the image to the world size. If False, tile the image on the world. 
    """

    # We use an oversize image to avoid slivers of other colour appearing at the edges
    # due to the size not being perfectly 800 x 600 on the actual webpage,
    # which means we are scaling and using anti-aliased sub-pixel rendering:
        
    # Note we always take a copy, even if the size is fine, because
    # we don't want later changes to affect the background:
    def background_808_606(image):
        dest = Image(808, 606)
        w = image.get_width()
        h = image.get_height()
        if not scale_to_fit:
            # Since we centre, even if two copies would fit, we will need 3 because we need half a copy
            # each side of the centre.  So just always draw one more than we need:
            horiz_copies = (_math.ceil(808 / w) if w < 808 else 0) + 1
            vert_copies = (_math.ceil(606 / h) if h < 606 else 0) + 1
            # We want one copy bang in the centre, so we need to work out the offset:
            # These offsets will either be zero or negative because we start by drawing
            # the far left or far top image.  We work out the position of the central
            # image then subtract the width/height of half of the copies we need: 
            x_offset = (808 - w) / 2 - (horiz_copies - 1) / 2 * w
            y_offset = (606 - h) / 2 - (vert_copies - 1) / 2 * h
            for i in range(0, horiz_copies):
                for j in range(0, vert_copies):
                    dest.draw_image(image, x_offset + i * w, y_offset + j * h)
        else:
            scale = max(808 / w, 606 / h)
            dest._draw_part_of_image(image, (808 - scale * w) / 2, (606 - scale * h) / 2, 0, 0, w, h, scale)
        return dest
        
    if isinstance(image_or_color, Image):
        bk_image = background_808_606(image_or_color)
    elif isinstance(image_or_color, str):
        # We follow this heuristic: if it has a dot, slash or colon it's a filename/URL
        # otherwise it's a color name/value.
        if _re.search(r"[.:/]", image_or_color):
            bk_image = background_808_606(load_image(image_or_color))
        else:
            bk_image = Image(808, 606)
            bk_image.set_fill(image_or_color)
            bk_image.fill()
    elif isinstance(image_or_color, Color):
        bk_image = Image(808, 606)
        bk_image.set_fill(image_or_color)
        bk_image.fill()
    else:
        raise TypeError("image_or_color must be an Image or a string or a Color")

    global _bk_image
    _bk_image = bk_image
    _strype_graphics_internal.setBackground(bk_image._Image__image)        

def get_background():
    # type: () -> Image
    # Real type is Image | None but that confuses TigerPython and doesn't gain us anything...
    """
    Gets the current background image.
    
    Any changes to the image (such as drawing on it) will be shown on the live display.
    
    Note that the image returned by get_background() will not be the same as that passed
    to set_background().  The image may have been tiled or stretched.  It may also not be exactly
    800 x 600; the image may be slightly oversized (e.g. 808 x 606) to make sure it covers
    the edges fully.  But its centre will be at (0, 0).
    
    :return: The live background image, or None if one has not been set.
    """
    return _bk_image

def get_actors(tag = None):
    # type: (Any | None) -> list[Actor]
    """
        Gets all actors.
        
        If the tag is specified, only actors with the given tag will be included.
        
        :param tag: The tag to use to filter the returned actors (or None to return all actors)
        :return: A list of all actors (that have not been removed via the `remove()` call).
        """
    return [a for a in _strype_input_internal.getAllActors() if tag is None or tag == a.get_tag()]

def stop():
    # type: () -> None
    """
    Stop the execution of the program.  This function will not return.
    """
    raise SystemExit()

def pause(seconds):
    # type: (float) -> None
    """
    Pause for the given amount of seconds.
    
    This can be a fractional amount, such as 0.5, or 1.2.  The entire code
    will pause for that length of time before beginning to execute.
    
    :param seconds: The amount of seconds to wait for.
    """
    _time.sleep(seconds)

_last_frame = _time.time()
# type: float

def pace(actions_per_second = 25):
    # type: (float) -> None
    """
    Wait for a suitable amount of time since the last call to pace().  This is almost always used as follows:
    
    .. code-block:: python
    
        while True:
            # Do all the actions you want to do in one iteration
            pace(25)
    
    
    Where 25 is the number of times you want to do those actions per second.  It is like sleeping
    for 1/25th of a second, but it accounts for the fact that your actions may have taken some time,
    so it aims to keep you executing the actions 25 times per second (or whatever value you pass
    for actions_per_second).
    
    :param actions_per_second: The amount of times you want to call pace() per second, 25 by default.
    """
    global _last_frame
    now = _time.time()
    # We sleep for 1/Nth minus the time since we last slept.  If it's negative (because we can't keep
    # up that frame rate), we just "sleep" for 0, so go as fast as we can:
    sleep_for = max(0.0, 1 / actions_per_second - max(0.0, now - _last_frame))
    _last_frame = now + sleep_for
    _time.sleep(sleep_for)
    
