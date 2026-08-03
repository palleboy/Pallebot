from pathlib import Path

from app.storage.json_store import JsonStore


DATA_FILE = Path(__file__).resolve().parents[2] / "data" / "notes.json"
store = JsonStore(DATA_FILE)


def add_note(user_id: int, text: str) -> None:
    notes = get_notes(user_id)
    notes.append({"text": text})
    store.save_for_user(user_id, notes)


def get_notes(user_id: int) -> list:
    return store.list_for_user(user_id)


def delete_note(user_id: int, index: int) -> bool:
    notes = get_notes(user_id)

    if index < 1 or index > len(notes):
        return False

    notes.pop(index - 1)
    store.save_for_user(user_id, notes)
    return True
