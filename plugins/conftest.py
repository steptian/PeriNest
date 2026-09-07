"""插件测试共享内核夹具（client/auth_headers）——experimental 不降质量标准。"""
import sys
from pathlib import Path

_QUEEN = Path(__file__).resolve().parents[1] / "queen"
if str(_QUEEN) not in sys.path:
    sys.path.insert(0, str(_QUEEN))

from tests.conftest import auth_headers, client  # noqa: E402,F401
