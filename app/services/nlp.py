from app.brain.intent import Intent, detect_intent
from app.brain.session import get_session


def process_message(user_id: int, text: str):

    session = get_session(user_id)

    original_text = text.strip()
    text_lower = original_text.lower()

    # ------------------------
    # Samtale
    # ------------------------

    if session.state == "waiting_for_time":
        return "WAITING_FOR_TIME"

    # ------------------------
    # Faste kommandoer
    # ------------------------

    if text_lower in (
        "vis noter",
        "mine noter",
    ):
        return "LIST_NOTES"

    if text_lower in (
        "vis mine påmindelser",
        "mine påmindelser",
    ):
        return "LIST_REMINDERS"

    if text_lower in (
        "vis indkøbslisten",
        "vis indkøbsliste",
        "indkøbsliste",
        "min indkøbsliste",
    ):
        return "LIST_SHOPPING"

    # ------------------------
    # Slet note
    # ------------------------

    if text_lower.startswith("slet note"):

        try:
            return (
                "DELETE_NOTE",
                int(text_lower.split()[-1]),
            )
        except ValueError:
            pass

    # ------------------------
    # Slet påmindelse
    # ------------------------

    if text_lower.startswith("slet påmindelse"):

        try:
            return (
                "DELETE_REMINDER",
                int(text_lower.split()[-1]),
            )
        except ValueError:
            pass

    # ------------------------
    # Slet vare
    # ------------------------

    if (
        text_lower.startswith("slet vare")
        or text_lower.startswith("fjern vare")
    ):

        try:
            return (
                "DELETE_ITEM",
                int(text_lower.split()[-1]),
            )
        except ValueError:
            pass

    # ------------------------
    # Marker som købt
    # ------------------------

    if (
        text_lower.startswith("købt")
        or text_lower.startswith("færdig")
    ):

        try:
            return (
                "CHECK_ITEM",
                int(text_lower.split()[-1]),
            )
        except ValueError:
            pass

    # ------------------------
    # Intent
    # ------------------------

    intent = detect_intent(original_text)

    # ======================================================
    # NOTE
    # ======================================================

    if intent == Intent.NOTE:

        prefixes = [
            "gem note",
            "gem",
            "notér at",
            "notér",
            "noter at",
            "noter",
            "skriv ned at",
            "skriv ned",
            "skriv en note om",
            "lav en note om",
        ]

        note = original_text

        for prefix in prefixes:

            if text_lower.startswith(prefix):

                note = original_text[len(prefix):].strip()

                break

        return ("ADD_NOTE", note)

    # ======================================================
    # SHOPPING
    # ======================================================

    if intent == Intent.SHOPPING:

        prefixes = [
            "tilføj",
            "køb",
            "købe",
            "jeg mangler",
        ]

        item = original_text

        for prefix in prefixes:

            if text_lower.startswith(prefix):

                item = original_text[len(prefix):].strip()

                break

        item = (
            item
            .replace("til indkøbslisten", "")
            .replace("på indkøbslisten", "")
            .strip()
        )

        return (
            "ADD_ITEM",
            item,
        )

    # ======================================================
    # REMINDER
    # ======================================================

    if intent == Intent.REMINDER:

        prefixes = [
            "husk mig på at",
            "husk mig",
            "husk",
            "mind mig om at",
            "mind mig om",
            "påmind mig om",
        ]

        reminder = original_text

        for prefix in prefixes:

            if text_lower.startswith(prefix):

                reminder = original_text[len(prefix):].strip()

                break

        session.state = "waiting_for_time"
        session.data["text"] = reminder

        return "ASK_TIME"

    return "UNKNOWN"