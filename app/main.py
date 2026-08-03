import asyncio

from app.bot import create_application
from app.clients.telegram.reminders import create_reminder_sender
from app.config import config
from app.logger import setup_logger
from app.services.scheduler import scheduler
from app.storage.migration import migrate_legacy_data


async def main():
    logger = setup_logger()

    logger.info("🤖 PalleBot starter...")

    migrated_collections = migrate_legacy_data(config.owner_user_id)
    if migrated_collections:
        logger.info(
            "✅ Data migreret til brugeropdelt storage: %s",
            ", ".join(migrated_collections),
        )

    application = create_application()

    logger.info("✅ Telegram-forbindelse oprettet")

    # Start scheduleren
    asyncio.create_task(scheduler(create_reminder_sender(application)))

    logger.info("⏰ Scheduler startet")

    logger.info("🚀 PalleBot kører...")

    await application.initialize()
    await application.start()
    await application.updater.start_polling()

    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await application.updater.stop()
        await application.stop()
        await application.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
