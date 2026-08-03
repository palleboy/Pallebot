from app.core.models import BotRequest, BotResponse, Task
from app.services.notes import add_note, delete_note, get_notes


def create_note(task: Task, request: BotRequest) -> BotResponse:
    text = task.data["value"]
    add_note(request.user_id, text)
    return BotResponse(f"✅ Note gemt:\n\n📝 {text}")


def show_notes(task: Task, request: BotRequest) -> BotResponse:
    notes = get_notes(request.user_id)

    if not notes:
        return BotResponse("📝 Du har ingen noter endnu.")

    lines = ["📝 Dine noter:", ""]
    lines.extend(
        f"{index}. {note['text']}"
        for index, note in enumerate(notes, start=1)
    )
    return BotResponse("\n".join(lines))


def remove_note(task: Task, request: BotRequest) -> BotResponse:
    if delete_note(request.user_id, task.data["value"]):
        return BotResponse("🗑️ Noten blev slettet.")

    return BotResponse("❌ Jeg kunne ikke finde den note.")


PLUGIN = {
    "ADD_NOTE": create_note,
    "LIST_NOTES": show_notes,
    "DELETE_NOTE": remove_note,
}
