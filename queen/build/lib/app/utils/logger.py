"""structlog JSON 日志 + trace_id 中间件。

生产环境输出 JSON 接 ELK/Loki；每个请求注入唯一 trace_id。
"""
import contextvars
import uuid

import structlog

trace_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="-")


def add_trace_id(_, __, event_dict: dict) -> dict:
    event_dict["trace_id"] = trace_id_var.get()
    return event_dict


def setup_logging(json_output: bool = True) -> None:
    """应用启动时调用一次。"""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            add_trace_id,
            structlog.processors.JSONRenderer() if json_output
            else structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO+
    )


def new_trace_id() -> str:
    tid = uuid.uuid4().hex[:16]
    trace_id_var.set(tid)
    return tid


logger = structlog.get_logger("perinest.queen")
