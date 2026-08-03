"""Engangsmigrering af PalleBots eksisterende v1-datafiler."""

from app.services import notes, reminders, shopping


def migrate_legacy_data(owner_user_id: int) -> list[str]:
    """Migrerer alle v1-filer og returnerer navnene på ændrede samlinger."""
    stores = {
        "notes": notes.store,
        "shopping": shopping.store,
        "reminders": reminders.store,
    }

    return [
        name
        for name, store in stores.items()
        if store.migrate_legacy(owner_user_id).migrated
    ]
