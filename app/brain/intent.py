from enum import Enum


class Intent(Enum):
    UNKNOWN = "unknown"

    REMINDER = "reminder"
    NOTE = "note"
    SHOPPING = "shopping"


REMINDER_WORDS = [
    "husk",
    "mind mig",
    "påmind",
]

NOTE_WORDS = [
    "note",
    "notér",
    "noter",
    "skriv ned",
    "gem",
]

SHOPPING_WORDS = [
    "indkøb",
    "indkøbsliste",
    "køb",
    "købe",
    "mangler",
    "tilføj",
]


def detect_intent(text: str) -> Intent:

    text = text.lower()

    for word in REMINDER_WORDS:
        if word in text:
            return Intent.REMINDER

    for word in NOTE_WORDS:
        if word in text:
            return Intent.NOTE

    for word in SHOPPING_WORDS:
        if word in text:
            return Intent.SHOPPING

    return Intent.UNKNOWN