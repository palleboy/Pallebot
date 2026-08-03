from app.core.models import BotRequest, BotResponse, Task
from app.services.shopping import add_item, complete_item, delete_item, get_items


def show_shopping(task: Task, request: BotRequest) -> BotResponse:
    items = get_items(request.user_id)

    if not items:
        return BotResponse("🛒 Din indkøbsliste er tom.")

    lines = ["🛒 Indkøbsliste:", ""]
    lines.extend(
        f"{index}. {'✅' if item['done'] else '⬜'} {item['text']}"
        for index, item in enumerate(items, start=1)
    )
    return BotResponse("\n".join(lines))


def create_item(task: Task, request: BotRequest) -> BotResponse:
    text = task.data["value"]
    add_item(request.user_id, text)
    return BotResponse(f"🛒 Tilføjet:\n\n{text}")


def remove_item(task: Task, request: BotRequest) -> BotResponse:
    if delete_item(request.user_id, task.data["value"]):
        return BotResponse("🗑️ Varen blev slettet.")

    return BotResponse("❌ Jeg kunne ikke finde varen.")


def check_item(task: Task, request: BotRequest) -> BotResponse:
    if complete_item(request.user_id, task.data["value"]):
        return BotResponse("✅ Varen er markeret som købt.")

    return BotResponse("❌ Jeg kunne ikke finde varen.")


PLUGIN = {
    "LIST_SHOPPING": show_shopping,
    "ADD_ITEM": create_item,
    "DELETE_ITEM": remove_item,
    "CHECK_ITEM": check_item,
}
