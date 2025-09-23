"""Global Python site customization for trimming auto_coder log paths.

When available on ``sys.path`` Python automatically imports this module
right after the standard :mod:`site` initialisation. We use this hook to
patch Loguru so that log records originating from the pipx-installed
``auto_coder`` package no longer include the long site-packages prefix.
"""

from __future__ import annotations

import os
import sys
from pathlib import PurePosixPath

try:
    from loguru import logger
except Exception:  # pragma: no cover - loguru might be unavailable
    logger = None


def _normalize(path: str) -> str:
    """Return a forward-slash normalised representation of ``path``."""
    return path.replace("\\", "/")


def _auto_coder_relative_path(path: str) -> str:
    """Strip the auto_coder site-packages prefix from ``path`` if present."""
    normalized = _normalize(path)

    env_prefix = os.environ.get("AUTO_CODER_LOG_PATH_PREFIX")
    prefixes: list[str] = []
    if env_prefix:
        prefixes.append(_normalize(env_prefix).rstrip("/") + "/")

    prefixes.extend(
        [
            "/site-packages/auto_coder/",
            "/site-packages/autocoder/",
            "/auto_coder/",
        ]
    )

    for prefix in prefixes:
        if prefix and prefix in normalized:
            return normalized.split(prefix, 1)[1]

    return normalized


if logger is not None and os.environ.get("AUTO_CODER_DISABLE_LOG_PATCH") != "1":

    def _patch_log_record(record: dict) -> None:
        trimmed = _auto_coder_relative_path(record["file"].path)
        record["file"].path = trimmed
        record["file"].name = PurePosixPath(trimmed).name
        record["extra"]["auto_coder_trimmed_path"] = trimmed

    logger.configure(patcher=_patch_log_record)

    format_str = os.environ.get(
        "LOGURU_FORMAT",
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level:<8}</level> | "
        "<cyan>{extra[auto_coder_trimmed_path]}</cyan>:"
        "<cyan>{line}</cyan> in <cyan>{function}</cyan> - "
        "<level>{message}</level>",
    )

    try:
        logger.remove()
    except Exception:  # pragma: no cover - defensive guard
        pass

    logger.add(sys.stderr, format=format_str)
