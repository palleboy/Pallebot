"""PalleBots klient-uafhængige samtaleflow."""

from app.brain.planner import planner
from app.brain.router import router
from app.brain.session import clear_session, get_session
from app.core.executor import executor
from app.core.models import BotRequest, BotResponse, Task


class AssistantEngine:
    """Oversætter et request til svar uden Telegram-afhængigheder."""

    def handle(self, request: BotRequest) -> list[BotResponse]:
        session = get_session(request.user_id)

        if session.state == "waiting_for_time":
            return self._handle_reminder_time(request)

        intent = router.route(request.user_id, request.text)

        if intent == "ASK_TIME":
            return [BotResponse("⏰ Hvornår skal jeg minde dig om det?")]

        if request.text == "⏰ Påmindelser":
            return [
                BotResponse(
                    "Du kan skrive:\n\n"
                    "• Husk mig på at købe mælk\n"
                    "• Vis mine påmindelser\n"
                    "• Slet påmindelse 1"
                )
            ]

        if intent == "UNKNOWN":
            return [
                BotResponse(
                    "🤔 Det forstod jeg ikke endnu.",
                    show_main_menu=True,
                )
            ]

        return executor.execute(planner.create_plan(intent), request)

    def _handle_reminder_time(self, request: BotRequest) -> list[BotResponse]:
        session = get_session(request.user_id)
        task = Task(
            action="CREATE_REMINDER",
            data={"text": session.data["text"], "when": request.text},
        )
        responses = executor.execute([task], request)

        if responses and all(response.completed for response in responses):
            clear_session(request.user_id)

        return responses


assistant_engine = AssistantEngine()
