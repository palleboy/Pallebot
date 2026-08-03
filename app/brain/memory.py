from dataclasses import dataclass, field


@dataclass
class Memory:
    """
    Midlertidig hukommelse for en bruger.
    Senere kan denne gemmes i en database.
    """

    notes: list = field(default_factory=list)
    preferences: dict = field(default_factory=dict)
    context: dict = field(default_factory=dict)


_memories = {}


def get_memory(user_id: int) -> Memory:
    if user_id not in _memories:
        _memories[user_id] = Memory()

    return _memories[user_id]


def clear_memory(user_id: int):
    if user_id in _memories:
        del _memories[user_id]