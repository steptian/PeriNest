"""异步邮件任务。"""
from app.tasks.celery_app import celery_app


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_email(self, to: str, subject: str, body: str) -> dict:
    """发送邮件。骨架阶段仅记录日志，接入 SMTP 后替换实现。"""
    # TODO: 接入 SMTP / 三方邮件服务
    print(f"[email] to={to} subject={subject} body_len={len(body)}")
    return {"ok": True, "to": to}


@celery_app.task
def send_batch_emails(payloads: list[dict]) -> dict:
    """批量推送。"""
    count = 0
    for p in payloads:
        send_email.delay(to=p["to"], subject=p["subject"], body=p.get("body", ""))
        count += 1
    return {"dispatched": count}
