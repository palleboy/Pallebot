import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime

from app.services.reminders import complete_reminder, get_due_reminders


ReminderSender = Callable[[int, str], Awaitable[None]]


async def scheduler(send_reminder: ReminderSender) -> None:
    """Finder forfaldne påmindelser og afleverer dem via den valgte klient."""

    while True:
        for reminder in get_due_reminders(datetime.now()):
            await send_reminder(reminder.chat_id, reminder.text)
            complete_reminder(reminder.user_id, reminder.index)

        await asyncio.sleep(30)
