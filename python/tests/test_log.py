import structlog
from symphony.log import configure_logging


def test_configure_logging():
    configure_logging(level="DEBUG")
    logger = structlog.get_logger()
    assert logger is not None


def test_configure_logging_with_file(tmp_path):
    log_file = tmp_path / "symphony.log"
    configure_logging(level="INFO", log_path=str(log_file))
    assert log_file.parent.exists()
