from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    filters,
)

from app.config import config
from app.handlers.menu import menu
from app.handlers.start import start


def create_application() -> Application:
    application = (
        Application.builder()
        .token(config.bot_token)
        .build()
    )

    application.add_handler(CommandHandler("start", start))
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, menu)
    )

    return application