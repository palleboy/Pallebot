from datetime import datetime
import dateparser


def parse_datetime(text: str) -> datetime | None:
    """
    Forsøger at forstå en dato/tid skrevet på dansk.
    """

    return dateparser.parse(
        text,
        languages=["da"],
        settings={
            "PREFER_DATES_FROM": "future",
            "RETURN_AS_TIMEZONE_AWARE": False,
        },
    )