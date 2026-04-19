from strype_bridge import strype_sound_internal as _strype_sound_internal 
import time as _time

class Sound:
    # Tracks the rate limiting for downloads:
    __last_download = _time.time()
    # type: float
    # There is a __buffer member which is of type RemoteSound
    
    def __init__(self, samples, samples_per_second = 44100):
        # type: (float, float) -> None
        """
        Creates a new soond object.  The first parameter is a list of samples from -1 to +1,
        and the optional second parameter indicates the sample rate (samples per second).
                 
        :param samples: A list of sound samples with values ranging from -1 to +1.  This list should not be empty; if it is, a single sample of value 0 will be used.
        :param samples_per_second: The sampling rate in samples per second. 
        """
        if samples_per_second == -4242: # Magic number used internally to indicate source is already a RemoteSOund
            # Important this clause is first, because if it's a Javascript object, performing
            # Python isinstance checks will give an error.  Which is why we use a magic number rather than
            # inspecting the type of seconds ourselves:
            self.__buffer = samples
        elif isinstance(samples, list):
            self.__buffer = _strype_sound_internal.createAudioBufferFromSamples(samples, samples_per_second)
        elif isinstance(samples, (int, float)):
            # For backwards compatibility: passing a number gives a silent buffer of that many seconds:
            self.__buffer = _strype_sound_internal.createAudioBuffer(samples, samples_per_second)
        else:
            raise TypeError(f"Samples should be a list, but was: {type(samples)}")
    
    def get_num_samples(self):
        # type: () -> float
        """
        Gets the length of the sound, in samples.
        
        :return: The length of the sound, in number of samples.
        """
        return _strype_sound_internal.getNumSamples(self.__buffer)
    
    def get_samples(self):
        # type: () -> list[float]
        """
        Gets all the samples from the sound.  This will be a list of numbers, each in the range -1 to +1.       
        
        :return: All the samples from the sound 
        """
        # Because it's a [proxy] object, must convert to Python before returning it:
        return _strype_sound_internal.getSamples(self.__buffer).to_py()

    def set_samples(self, sample_list):
        # type: (list[float]) -> None
        """
        Replaces the contents of this sound with the given list of sample values (which should each be in the range -1 to +1, with 0 as the middle).
        This may change the length of the sound if the number of samples is different to the original
        number of samples.
        
        :param sample_list: The list of numbers (each in the range -1 to +1) to use for the sound, one per sample.
        """
        _strype_sound_internal.setSamples(self.__buffer, sample_list)

    def play(self):
        # type: () -> None
        """
        Starts playing the sound from the start, but returns immediately without waiting for the sound to finish playing.
        """
        _strype_sound_internal.startAudioBuffer(self.__buffer)

    def play_and_wait(self):
        # type: () -> None
        """
        Plays the sound.  Does not return until the sound has finished playing.
        """
        _strype_sound_internal.playAudioBufferAndWait(self.__buffer)
        
    def stop(self):
        # type: () -> None
        """
        Stops the sound that was previously played with `play()`, if it is still playing.
        """
        _strype_sound_internal.stopAudioBuffer(self.__buffer)
        
    def copy_to_mono(self):
        # type: () -> Sound
        """
        Returns a copy of this sound which is mono (i.e. one channel, rather than left/right).
        
        If you want to work with the sound via `get_samples()` and `set_samples()`, you can only do this on a mono sound.
        
        :return: A copy of this sound (leaving this sound unmodified) with the content of this one converted to mono.
        """
        return Sound(_strype_sound_internal.copyToMono(self.__buffer), -4242)

    def clone(self):
        # type: () -> Sound
        """
        Returns a copy of this sound.
        
        :return: A copy of this sound (leaving this sound unmodified).
        """
        return Sound(_strype_sound_internal.copy(self.__buffer), -4242)

    def get_sample_rate(self):
        # type: () -> float
        """
        Gets the number of samples per second in the sound.  This can be different for different sound files.
        
        :return: The number of samples per second in the sound.
        """
        return _strype_sound_internal.getSampleRate(self.__buffer)

    def download(self, filename="strype-sound"):
        # type: (str) -> None
        """
        Triggers a download of this sound as a WAV sound file.  You can optionally
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
        if now < Sound.__last_download + 2:
            _time.sleep(Sound.__last_download + 2 - now)
        _strype_sound_internal.downloadWAV(self.__buffer, filename)
        Sound.__last_download = _time.time()

def load_sound(source):
    # type: (str) -> Sound
    """
    Loads the given sound file as a Sound object.

    Note that most browsers will resample loaded sounded files to a fixed rate (44100 or 48000).
    So the sample rate of a loaded sound file will probably not match the original file you are loading from.
    You can call get_sample_rate() on the loaded sound to get the actual sample rate.       
    
    Note: you can pass a filename for the sound, which is a sound name from Strype's sound library,
        or a URL to an image.  Using a URL requires the server to allow remote loading from Javascript via a feature
        called CORS.   Many servers do not allow this, so you may get an error even if the URL is valid and
        you can load the sound in a browser yourself.

    :param source: The filename or URL to a sound file 
    :return: The loaded sound
    """
    # If they mistakenly try to load a sound (e.g. a literal) just let it through:
    if isinstance(source, Sound):
        return source
    if source.startswith("http:") or source.startswith("https:") or source.startswith("data:"):
        buffer = _strype_sound_internal.loadAndWaitForAudioBuffer(source)
    else:
        # We load it from our virtual file system, either the current dir or /strype/graphics/
        # To pass it on, it's probably faster to turn it into a data URL than e.g. read bytes
        # and pass a long list of numbers which Pyodide has to convert item by array item to Javascript: 
        import base64
        import mimetypes

        # If both fail, it will give an informative error (no such file):
        try:
            with open(source, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("ascii")
        except:
            with open("/strype/sounds/" + source, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("ascii")
        mime_type, _ = mimetypes.guess_type(source)
        buffer = _strype_sound_internal.loadAndWaitForAudioBuffer(f"data:{mime_type};base64,{encoded}")

    return Sound(buffer, -4242)
