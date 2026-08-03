from pathlib import Path

from app.storage.json_store import JsonStore


DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "shopping.json"
store = JsonStore(DATA_FILE)


def add_item(user_id: int, text: str) -> None:
    items = get_items(user_id)
    items.append({"text": text, "done": False})
    store.save_for_user(user_id, items)


def get_items(user_id: int) -> list:
    return store.list_for_user(user_id)


def delete_item(user_id: int, index: int) -> bool:
    items = get_items(user_id)

    if index < 1 or index > len(items):
        return False

    items.pop(index - 1)
    store.save_for_user(user_id, items)
    return True


def complete_item(user_id: int, index: int) -> bool:
    items = get_items(user_id)

    if index < 1 or index > len(items):
        return False

    items[index - 1]["done"] = True
    store.save_for_user(user_id, items)
    return True
