import asyncio
import logging

from symphony.exceptions import HookError, HookTimeout

logger = logging.getLogger(__name__)


async def run_hook(
    script: str,
    cwd: str,
    timeout_ms: int,
    hook_name: str,
    best_effort: bool = False,
) -> bool:
    """Execute a shell hook script.

    Returns True on success, False on failure if best_effort=True.
    Raises HookError on failure if best_effort=False.
    Raises HookTimeout if hook exceeds timeout_ms.
    """
    logger.info("hook_start", extra={"hook": hook_name, "cwd": cwd})
    try:
        proc = await asyncio.create_subprocess_shell(
            script,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout_ms / 1000.0
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            logger.error("hook_timeout", extra={"hook": hook_name, "timeout_ms": timeout_ms})
            raise HookTimeout(f"Hook '{hook_name}' timed out after {timeout_ms}ms")

        if proc.returncode != 0:
            stderr_text = stderr.decode("utf-8", errors="replace")[:500]
            logger.error("hook_failed", extra={"hook": hook_name, "returncode": proc.returncode, "stderr": stderr_text})
            if best_effort:
                return False
            raise HookError(f"Hook '{hook_name}' failed with exit code {proc.returncode}")

        logger.info("hook_completed", extra={"hook": hook_name})
        return True

    except HookTimeout:
        raise
    except HookError:
        raise
    except Exception as e:
        logger.error("hook_error", extra={"hook": hook_name, "error": str(e)})
        if best_effort:
            return False
        raise HookError(f"Hook '{hook_name}' error: {e}") from e
