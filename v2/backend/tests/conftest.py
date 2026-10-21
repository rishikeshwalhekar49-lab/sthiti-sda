import os
import shutil
import tempfile
from pathlib import Path

# API tests build from a throwaway copy of the cache, offline, so they can never mark a day
# missing in the real cache or depend on NSE being reachable.
_tmp = Path(tempfile.mkdtemp(prefix="sthiti-test-cache-"))
shutil.copytree(Path(__file__).resolve().parent.parent / "cache", _tmp / "cache")
os.environ["STHITI_CACHE"] = str(_tmp / "cache")
for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "GROQ_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY"):
    os.environ.pop(k, None)  # tests never call a paid model


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_tmp, ignore_errors=True)
