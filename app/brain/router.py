from app.services.nlp import process_message


class Router:
    """
    Routeren er PalleBots hjerne.
    Den afgør, hvilken handling der skal udføres.
    """

    def route(self, user_id: int, text: str):
        return process_message(user_id, text)


router = Router()