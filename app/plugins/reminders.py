from app.core.models import BotRequest, BotResponse, Task
from app.services.reminders import add_reminder, delete_reminder, get_active_reminders


def create_reminder(task: Task, request: BotRequest) -> BotResponse:
    text = task.data["text"]
    when = task.data["when"]

    if not add_reminder(
        user_id=request.user_id,
        text=text,
        when=when,
        chat_id=request.chat_id,
    ):
        return BotResponse(
            "❌ Jeg kunne ikke forstå tidspunktet.\n\n"
            "Prøv f.eks.\n"
            "• Om 10 minutter\n"
            "• I morgen klokken 14\n"
            "• På fredag klokken 09",
            completed=False,
        )

    return BotResponse(f"✅ Påmindelse gemt!\n\n📝 {text}\n⏰ {when}")


def show_reminders(task: Task, request: BotRequest) -> BotResponse:
    reminders = get_active_reminders(request.user_id)

    if not reminders:
        return BotResponse("📭 Du har ingen aktive påmindelser.")

    lines = ["📋 Dine påmindelser:", ""]
    for index, reminder in enumerate(reminders, start=1):
        time = reminder.get("datetime", reminder.get("when", "Ukendt"))
        lines.append(f"{index}. {reminder['text']}\n⏰ {time}\n")

    return BotResponse("\n".join(lines).rstrip())


def remove_reminder(task: Task, request: BotRequest) -> BotResponse:
    if delete_reminder(request.user_id, task.data["value"]):
        return BotResponse("🗑️ Påmindelsen blev slettet.")

    return BotResponse("❌ Jeg kunne ikke finde den påmindelse.")


PLUGIN = {
    "CREATE_REMINDER": create_reminder,
    "LIST_REMINDERS": show_reminders,
    "DELETE_REMINDER": remove_reminder,
}
