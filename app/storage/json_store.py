"""Lille, brugeropdelt JSON-storage med sikker migration fra v1."""

from __future__ import annotations

import copy
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


STORAGE_VERSION = 2


class StorageFormatError(ValueError):
    """Datafilen har ikke et format, som PalleBot kan læse sikkert."""


@dataclass(frozen=True)
class MigrationResult:
    migrated: bool
    backup_path: Path | None = None


class JsonStore:
    """Gemmer en samling poster adskilt efter bruger-id."""

    def __init__(self, path: Path):
        self.path = path

    def migrate_legacy(self, owner_user_id: int) -> MigrationResult:
        """Migrerer en v1-liste til v2 og bevarer en skrivebeskyttet backup."""
        raw = self._read_raw()

        if raw is None:
            self._write_document(self._empty_document())
            return MigrationResult(migrated=False)

        if not isinstance(raw, list):
            self._validate_document(raw)
            return MigrationResult(migrated=False)

        backup_path = self.path.with_suffix(".v1.backup.json")
        if not backup_path.exists():
            self._write_json(backup_path, raw)

        document = self._empty_document()
        document["users"][str(owner_user_id)] = raw
        self._write_document(document)
        return MigrationResult(migrated=True, backup_path=backup_path)

    def list_for_user(self, user_id: int) -> list[dict[str, Any]]:
        document = self._read_document()
        records = document["users"].get(str(user_id), [])
        return copy.deepcopy(records)

    def save_for_user(self, user_id: int, records: list[dict[str, Any]]) -> None:
        document = self._read_document()
        document["users"][str(user_id)] = copy.deepcopy(records)
        self._write_document(document)

    def all_users(self) -> dict[int, list[dict[str, Any]]]:
        document = self._read_document()
        return {
            int(user_id): copy.deepcopy(records)
            for user_id, records in document["users"].items()
        }

    def _read_document(self) -> dict[str, Any]:
        raw = self._read_raw()
        if raw is None:
            return self._empty_document()

        if isinstance(raw, list):
            raise StorageFormatError(
                f"{self.path.name} er ikke migreret endnu."
            )

        self._validate_document(raw)
        return raw

    def _read_raw(self) -> Any | None:
        if not self.path.exists():
            return None

        with self.path.open("r", encoding="utf-8") as file:
            return json.load(file)

    @staticmethod
    def _empty_document() -> dict[str, Any]:
        return {"version": STORAGE_VERSION, "users": {}}

    @staticmethod
    def _validate_document(document: Any) -> None:
        if not isinstance(document, dict):
            raise StorageFormatError("Storage-dokumentet skal være et objekt.")

        if document.get("version") != STORAGE_VERSION:
            raise StorageFormatError("Ukendt version af storage-dokumentet.")

        users = document.get("users")
        if not isinstance(users, dict):
            raise StorageFormatError("Storage-dokumentet mangler brugerdata.")

        if not all(isinstance(records, list) for records in users.values()):
            raise StorageFormatError("Brugerdata skal være lister af poster.")

    def _write_document(self, document: dict[str, Any]) -> None:
        self._validate_document(document)
        self._write_json(self.path, document)

    @staticmethod
    def _write_json(path: Path, data: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)

        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            delete=False,
        ) as temporary_file:
            json.dump(data, temporary_file, ensure_ascii=False, indent=4)
            temporary_path = Path(temporary_file.name)

        os.replace(temporary_path, path)
