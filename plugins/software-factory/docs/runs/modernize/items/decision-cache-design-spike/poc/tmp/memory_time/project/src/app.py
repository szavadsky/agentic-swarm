from beartype import beartype


@beartype
def load() -> int:
    return 1


VALUE = load()
