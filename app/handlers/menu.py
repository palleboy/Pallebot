"""Telegram-adapteren for almindelige brugerbeskeder."""

from telegram import Update
from telegram.ext import ContextTypes

from app.core.engine import assistant_engine
from app.core.models import BotRequest
from app.keyboards.main_menu import get_main_menu


async def menu(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:
    request = BotRequest(
        user_id=update.effective_user.id,
        chat_id=update.effective_chat.id,
        text=update.message.text,
    )

    for response in assistant_engine.handle(request):
        reply_markup = get_main_menu() if response.show_main_menu else None
        await update.message.reply_text(
            response.text,
            reply_markup=reply_markup,
        )
