from dataclasses import dataclass
from typing import Optional


@dataclass
class Session:
    state: Optional[str] = None
    data: dict | None = None

    def __post_init__(self):
        if self.data is None:
            self.data = {}


_sessions: dict[int, Session] = {}


def get_session(user_id: int) -> Session:
    if user_id not in _sessions:
        _sessions[user_id] = Session()

    return _sessions[user_id]


def clear_session(user_id: int) -> None:
    _sessions[user_id] = Session()