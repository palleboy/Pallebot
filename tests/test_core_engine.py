import unittest
from unittest.mock import patch

from app.brain.session import clear_session, get_session
from app.core.engine import assistant_engine
from app.core.models import BotRequest


class AssistantEngineTests(unittest.TestCase):
    user_id = 987654
    request_base = {"user_id": user_id, "chat_id": user_id}

    def setUp(self):
        clear_session(self.user_id)

    def tearDown(self):
        clear_session(self.user_id)

    def request(self, text: str) -> BotRequest:
        return BotRequest(text=text, **self.request_base)

    @patch("app.plugins.notes.add_note")
    def test_note_is_executed_without_a_telegram_object(self, add_note):
        response = assistant_engine.handle(self.request("gem note køb mælk"))[0]

        add_note.assert_called_once_with(self.user_id, "køb mælk")
        self.assertIn("Note gemt", response.text)

    def test_unknown_message_returns_a_client_response(self):
        response = assistant_engine.handle(self.request("hej verden"))[0]

        self.assertTrue(response.show_main_menu)
        self.assertIn("forstod", response.text)

    @patch("app.plugins.reminders.add_reminder", return_value=False)
    def test_invalid_reminder_time_keeps_the_session_open(self, add_reminder):
        assistant_engine.handle(self.request("husk tandlægen"))
        response = assistant_engine.handle(self.request("et ugyldigt tidspunkt"))[0]

        add_reminder.assert_called_once()
        self.assertFalse(response.completed)
        self.assertEqual(
            get_session(self.user_id).state,
            "waiting_for_time",
        )


if __name__ == "__main__":
    unittest.main()
