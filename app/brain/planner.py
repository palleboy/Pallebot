from app.core.models import Task


class Planner:
    """
    Omdanner brugerens ønske til en liste af opgaver.
    """

    def create_plan(self, intent_result):

        tasks = []

        # -------------------------------------------------
        # Flere opgaver
        # -------------------------------------------------

        if isinstance(intent_result, list):

            for item in intent_result:

                if isinstance(item, tuple):

                    action, value = item

                    tasks.append(
                        Task(
                            action=action,
                            data={
                                "value": value,
                            },
                        )
                    )

                else:

                    tasks.append(
                        Task(
                            action=item,
                        )
                    )

            return tasks

        # -------------------------------------------------
        # En opgave
        # -------------------------------------------------

        if isinstance(intent_result, tuple):

            action, value = intent_result

            tasks.append(
                Task(
                    action=action,
                    data={
                        "value": value,
                    },
                )
            )

            return tasks

        # -------------------------------------------------
        # Tekst
        # -------------------------------------------------

        if isinstance(intent_result, str):

            tasks.append(
                Task(
                    action=intent_result,
                )
            )

        return tasks


planner = Planner()
