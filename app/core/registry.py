import importlib
import pkgutil

import app.plugins


class Registry:

    def __init__(self):

        self.commands = {}

        self.load_plugins()

    def load_plugins(self):

        for _, module_name, _ in pkgutil.iter_modules(
            app.plugins.__path__
        ):

            module = importlib.import_module(
                f"app.plugins.{module_name}"
            )

            plugin = getattr(
                module,
                "PLUGIN",
                {}
            )

            self.commands.update(plugin)

            print(f"Loaded plugin: {module_name}")

    def get(self, action):

        return self.commands.get(action)


registry = Registry()