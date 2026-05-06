import asyncio
import logging
import sys
import os
import signal

from symphony.cli import parse_args
from symphony.log import configure_logging
from symphony.workflow_store import WorkflowStore
from symphony.orchestrator import SymphonyOrchestrator
from symphony.workspace import WorkspaceManager
from symphony.tracker.memory import MemoryTracker

logger = logging.getLogger(__name__)


async def async_main():
    args = parse_args()
    log_level = os.environ.get("SYMPHONY_LOG_LEVEL", "INFO")
    logs_root = args.logs_root or os.path.join(os.getcwd(), "log")
    os.makedirs(logs_root, exist_ok=True)
    log_path = os.path.join(logs_root, "symphony.log")
    configure_logging(level=log_level, log_path=log_path)

    logger.info("symphony_starting", extra={"log_path": log_path})

    store = WorkflowStore(path=args.workflow_path)
    if store.workflow is None:
        logger.critical("workflow_load_failed", extra={"error": store.last_error})
        sys.exit(1)

    config = store.config

    errors = config.validate_dispatch()
    if errors:
        for err in errors:
            logger.critical("config_validation_failed", extra={"error": err})
        sys.exit(1)

    logger.info("symphony_config_loaded",
                extra={"tracker_kind": config.tracker.kind,
                       "project_slug": config.tracker.project_slug,
                       "max_concurrent": config.agent.max_concurrent_agents})

    tracker = MemoryTracker(active_states=config.tracker.active_states)

    ws_mgr = WorkspaceManager(
        root=config.workspace.root,
        after_create=config.hooks.after_create,
        before_run=config.hooks.before_run,
        after_run=config.hooks.after_run,
        before_remove=config.hooks.before_remove,
        hook_timeout_ms=config.hooks.timeout_ms,
    )

    orch = SymphonyOrchestrator(
        tracker=tracker,
        workspace_manager=ws_mgr,
        max_concurrent=config.agent.max_concurrent_agents,
        poll_interval_ms=config.polling.interval_ms,
        active_states=config.tracker.active_states,
        terminal_states=config.tracker.terminal_states,
        max_turns=config.agent.max_turns,
        max_retry_backoff_ms=config.agent.max_retry_backoff_ms,
        stall_timeout_ms=config.codex.stall_timeout_ms,
    )

    # Start HTTP server if enabled
    server_task = None
    server_port = args.port or (config.server.port if config.server and config.server.port else None)
    if server_port:
        try:
            from symphony.server.app import create_app
            import uvicorn

            async def get_state():
                return orch.state

            app = create_app(
                orchestrator=get_state,
                refresh_callback=lambda: asyncio.ensure_future(orch._tick()),
            )
            cfg = uvicorn.Config(app, host="127.0.0.1", port=server_port, log_level="info")
            server = uvicorn.Server(cfg)
            server_task = asyncio.create_task(server.serve())
            logger.info("http_server_started", extra={"port": server_port})
        except ImportError:
            logger.warning("http_server_disabled", extra={"detail": "Install symphony[server] for HTTP support"})

    # Handle shutdown
    stop_event = asyncio.Event()

    def _shutdown():
        logger.info("shutdown_requested")
        orch.stop()
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown)
        except NotImplementedError:
            pass

    logger.info("symphony_started")
    try:
        await orch.run()
    except asyncio.CancelledError:
        pass

    if server_task:
        server_task.cancel()

    logger.info("symphony_stopped")


def main():
    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
