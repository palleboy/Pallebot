from telegram import Update
from telegram.ext import ContextTypes

from app.keyboards.main_menu import get_main_menu


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "👋 Hej Palle!\n\nVelkommen til PalleBot.\n\nVælg en funktion nedenfor.",
        reply_markup=get_main_menu(),
    )