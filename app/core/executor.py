"""Udfører planlagte opgaver uden at kende den aktive klient."""

from app.core.models import BotRequest, BotResponse, Task
from app.core.registry import registry


class Executor:
    def execute(
        self,
        tasks: list[Task],
        request: BotRequest,
    ) -> list[BotResponse]:
        responses = []

        for task in tasks:
            handler = registry.get(task.action)

            if handler is None:
                responses.append(BotResponse(f"Ukendt handling: {task.action}"))
                continue

            responses.append(handler(task, request))

        return responses


executor = Executor()
