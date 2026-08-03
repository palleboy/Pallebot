from telegram import ReplyKeyboardMarkup


def get_main_menu() -> ReplyKeyboardMarkup:
    keyboard = [
        ["⏰ Påmindelser", "📋 Opgaver"],
        ["📝 Noter", "🛒 Indkøb"],
        ["🏠 Boliger", "🧾 Kvitteringer"],
        ["🚗 Wolt", "💰 Budget"],
        ["⚙️ Indstillinger"],
    ]

    return ReplyKeyboardMarkup(
        keyboard,
        resize_keyboard=True,
        is_persistent=True,
    )