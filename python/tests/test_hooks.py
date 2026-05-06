import asyncio
import sys

import pytest
from symphony.hooks import run_hook
from symphony.exceptions import HookError, HookTimeout

SLEEP_10 = "sleep 10" if sys.platform != "win32" else "python -c \"import time; time.sleep(10)\""


@pytest.mark.asyncio
async def test_run_hook_success(tmp_path):
    script = "echo hello"
    result = await run_hook(script, cwd=str(tmp_path), timeout_ms=5000, hook_name="test")
    assert result is True


@pytest.mark.asyncio
async def test_run_hook_failure(tmp_path):
    script = "exit 1"
    with pytest.raises(HookError):
        await run_hook(script, cwd=str(tmp_path), timeout_ms=5000, hook_name="test")


@pytest.mark.asyncio
async def test_run_hook_timeout(tmp_path):
    with pytest.raises(HookTimeout):
        await run_hook(SLEEP_10, cwd=str(tmp_path), timeout_ms=100, hook_name="test")


@pytest.mark.asyncio
async def test_run_hook_best_effort(tmp_path):
    script = "exit 1"
    result = await run_hook(script, cwd=str(tmp_path), timeout_ms=5000, hook_name="test", best_effort=True)
    assert result is False
