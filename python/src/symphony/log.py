import logging
import sys

import structlog


def configure_logging(
    level: str = "INFO",
    log_path: str | None = None,
):
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ]

    structlog.configure(
        processors=processors,
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(sys.stderr),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO))
    logging.getLogger().handlers.clear()

    if log_path:
        file_handler = logging.FileHandler(log_path)
        file_handler.setLevel(getattr(logging, level.upper(), logging.INFO))
        formatter = logging.Formatter(
            "%(asctime)s %(name)s %(levelname)s %(message)s"
        )
        file_handler.setFormatter(formatter)
        logging.getLogger().addHandler(file_handler)
