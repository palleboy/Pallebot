import logging
from pathlib import Path

from app.config import config


def setup_logger() -> logging.Logger:
    """Opretter og konfigurerer PalleBots logger."""

    log_folder = Path("logs")
    log_folder.mkdir(exist_ok=True)

    logger = logging.getLogger("PalleBot")
    logger.setLevel(config.log_level)

    if logger.handlers:
        return logger

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s"
    )

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    file_handler = logging.FileHandler(
        log_folder / "pallebot.log",
        encoding="utf-8"
    )
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger