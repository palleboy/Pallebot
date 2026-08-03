from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.services.datetime_parser import parse_datetime
from app.storage.json_store import JsonStore


DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "reminders.json"
store = JsonStore(DATA_FILE)


@dataclass(frozen=True)
class DueReminder:
    user_id: int
    index: int
    chat_id: int
    text: str


def add_reminder(user_id: int, text: str, when: str, chat_id: int) -> bool:
    reminder_time = parse_datetime(when)

    if reminder_time is None:
        return False

    reminders = store.list_for_user(user_id)
    reminders.append(
        {
            "text": text,
            "datetime": reminder_time.isoformat(),
            "chat_id": chat_id,
            "done": False,
        }
    )
    store.save_for_user(user_id, reminders)
    return True


def get_active_reminders(user_id: int) -> list:
    return [
        reminder
        for reminder in store.list_for_user(user_id)
        if not reminder.get("done", False)
    ]


def delete_reminder(user_id: int, index: int) -> bool:
    reminders = store.list_for_user(user_id)
    active_indices = [
        record_index
        for record_index, reminder in enumerate(reminders)
        if not reminder.get("done", False)
    ]

    if index < 1 or index > len(active_indices):
        return False

    reminders.pop(active_indices[index - 1])
    store.save_for_user(user_id, reminders)
    return True


def update_reminder(user_id: int, index: int, when: str) -> bool:
    reminder_time = parse_datetime(when)

    if reminder_time is None:
        return False

    reminders = store.list_for_user(user_id)
    active_indices = [
        record_index
        for record_index, reminder in enumerate(reminders)
        if not reminder.get("done", False)
    ]

    if index < 1 or index > len(active_indices):
        return False

    reminders[active_indices[index - 1]]["datetime"] = reminder_time.isoformat()
    store.save_for_user(user_id, reminders)
    return True


def get_due_reminders(now: datetime) -> list[DueReminder]:
    due_reminders = []

    for user_id, reminders in store.all_users().items():
        for index, reminder in enumerate(reminders):
            if reminder.get("done", False):
                continue

            try:
                reminder_time = datetime.fromisoformat(reminder["datetime"])
            except (KeyError, TypeError, ValueError):
                continue

            if now >= reminder_time:
                due_reminders.append(
                    DueReminder(
                        user_id=user_id,
                        index=index,
                        chat_id=reminder["chat_id"],
                        text=reminder["text"],
                    )
                )

    return due_reminders


def complete_reminder(user_id: int, index: int) -> bool:
    reminders = store.list_for_user(user_id)

    if index < 0 or index >= len(reminders):
        return False

    reminders[index]["done"] = True
    store.save_for_user(user_id, reminders)
    return True
