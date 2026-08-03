import json
import tempfile
import unittest
from pathlib import Path

from app.storage.json_store import JsonStore


class JsonStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.path = Path(self.temporary_directory.name) / "notes.json"
        self.store = JsonStore(self.path)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_legacy_list_is_backed_up_and_migrated_to_its_owner(self):
        legacy_records = [{"text": "Køb mælk"}]
        self.path.write_text(json.dumps(legacy_records), encoding="utf-8")

        result = self.store.migrate_legacy(owner_user_id=42)

        self.assertTrue(result.migrated)
        self.assertEqual(self.store.list_for_user(42), legacy_records)
        self.assertEqual(self.store.list_for_user(99), [])
        self.assertEqual(
            json.loads(result.backup_path.read_text(encoding="utf-8")),
            legacy_records,
        )

    def test_users_are_isolated(self):
        self.store.migrate_legacy(owner_user_id=42)
        self.store.save_for_user(42, [{"text": "Privat note"}])
        self.store.save_for_user(99, [{"text": "Anden note"}])

        self.assertEqual(self.store.list_for_user(42), [{"text": "Privat note"}])
        self.assertEqual(self.store.list_for_user(99), [{"text": "Anden note"}])


if __name__ == "__main__":
    unittest.main()
