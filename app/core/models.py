"""Fælles, klient-uafhængige dataobjekter for PalleBot-kernen."""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class BotRequest:
    """En besked fra en vilkårlig klient, f.eks. Telegram eller en app."""

    user_id: int
    chat_id: int
    text: str


@dataclass
class Task:
    """En enkelt opgave, som et plugin skal udføre."""

    action: str
    data: dict = field(default_factory=dict)


@dataclass(frozen=True)
class BotResponse:
    """Et svar, som klienten skal vise brugeren."""

    text: str
    show_main_menu: bool = False
    completed: bool = True
