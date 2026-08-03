from dataclasses import dataclass
import os

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    bot_token: str = os.getenv("BOT_TOKEN", "")
    owner_chat_id: str = os.getenv("OWNER_CHAT_ID", "")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    @property
    def owner_user_id(self) -> int:
        if not self.owner_chat_id:
            raise RuntimeError("OWNER_CHAT_ID skal være sat før data kan migreres.")

        return int(self.owner_chat_id)


config = Config()
