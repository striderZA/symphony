import argparse


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Symphony — orchestrate coding agents from Linear issues",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "workflow_path",
        nargs="?",
        default=None,
        help="Path to WORKFLOW.md (default: ./WORKFLOW.md)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Enable HTTP server on this port (§13.7)",
    )
    parser.add_argument(
        "--logs-root",
        type=str,
        default=None,
        help="Directory for log files (default: ./log)",
    )
    return parser.parse_args(argv)
