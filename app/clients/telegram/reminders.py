from telegram.ext import Application


def create_reminder_sender(application: Application):
    """Returnerer den Telegram-specifikke leveringsfunktion til scheduleren."""

    async def send_reminder(chat_id: int, text: str) -> None:
        await application.bot.send_message(
            chat_id=chat_id,
            text=f"🔔 Påmindelse\n\n{text}",
        )

    return send_reminder
