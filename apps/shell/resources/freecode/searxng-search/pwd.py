"""Windows stand-in: SearXNG imports pwd at module level only for a Valkey error path."""
def getpwuid(_uid):
    raise KeyError("pwd is not available on Windows")
