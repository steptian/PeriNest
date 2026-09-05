"""Cercus 尾须 · 企微开放接口封装（通用化，自 JJKK wecom-sidebar 提炼）。

corp_id + secret 直调企微开放接口；access_token 进程缓存（7200s）。
未配置 WECOM_* 环境变量时整体禁用（wecom_enabled=False，
端点返回结构化 503——与 Nerve mock 哲学一致：demo 零成本）。
"""
import time

import httpx
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)

QYAPI = "https://qyapi.weixin.qq.com/cgi-bin"
_ACCESS_TOKEN_CACHE: dict = {"value": None, "expires_at": 0.0}


class WecomDisabledError(RuntimeError):
    """未配置企微凭证。"""


def _require_enabled() -> None:
    if not settings.wecom_enabled:
        raise WecomDisabledError("企微未配置（WECOM_CORP_ID/SECRET/AGENT_ID 缺失）")


async def get_access_token() -> str:
    """获取（并缓存）企微应用 access_token。"""
    _require_enabled()
    now = time.time()
    if _ACCESS_TOKEN_CACHE["value"] and now < _ACCESS_TOKEN_CACHE["expires_at"]:
        return _ACCESS_TOKEN_CACHE["value"]
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{QYAPI}/gettoken",
            params={
                "corpid": settings.WECOM_CORP_ID,
                "corpsecret": settings.WECOM_CORP_SECRET,
            },
        )
        data = resp.json()
        if data.get("errcode"):
            raise RuntimeError(f"企微 gettoken 失败: {data}")
    token = data["access_token"]
    _ACCESS_TOKEN_CACHE.update(value=token, expires_at=now + 7000)
    return token


async def _qyapi(method: str, path: str, **kwargs) -> dict:
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await getattr(client, method)(
            f"{QYAPI}/{path}", params={"access_token": token, **kwargs.pop("params", {})}, **kwargs
        )
        data = resp.json()
        if data.get("errcode"):
            raise RuntimeError(f"企微 {path} 失败: {data}")
        return data


async def get_external_contact(external_userid: str) -> dict:
    """外部联系人详情（名称/备注/手机号等）。"""
    return await _qyapi("get", "externalcontact/get", params={"external_userid": external_userid})


async def list_external_contacts(staff_userid: str) -> list[str]:
    """某员工的外部联系人 external_userid 列表。"""
    data = await _qyapi("get", "externalcontact/list", params={"userid": staff_userid})
    return data.get("external_userid", [])


async def get_userid_by_code(code: str) -> str | None:
    """OAuth code → 员工 userid（侧边栏免登）。"""
    _require_enabled()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{QYAPI}/auth/getuserinfo",
            params={
                "access_token": await get_access_token(),
                "code": code,
            },
        )
        return resp.json().get("userid")


async def get_jsapi_ticket(agent: bool = False) -> str:
    """JS-SDK ticket（侧边栏 wx.config / agentConfig 用）。"""
    path = "ticket/get" if not agent else "ticket/get"
    data = await _qyapi(
        "get", path, params={"type": "agent_config" if agent else "corp_config"}
    )
    return data["ticket"]


async def make_jsapi_signature(url: str, agent: bool = False) -> dict:
    """生成前端 wx.config / wx.agentConfig 签名四件套。"""
    import hashlib
    import random
    import string

    ticket = await get_jsapi_ticket(agent)
    nonce = "".join(random.choices(string.ascii_letters + string.digits, k=16))
    timestamp = str(int(time.time()))
    raw = f"jsapi_ticket={ticket}&noncestr={nonce}&timestamp={timestamp}&url={url}"
    signature = hashlib.sha1(raw.encode()).hexdigest()
    return {
        "corpid": settings.WECOM_CORP_ID,
        "agentid": settings.WECOM_AGENT_ID,
        "timestamp": timestamp,
        "nonceStr": nonce,
        "signature": signature,
    }


async def sync_contacts_for_staff(staff_userid: str) -> list[dict]:
    """拉取员工全部外部联系人（详情级），返回精简镜像列表。"""
    import datetime

    out: list[dict] = []
    for eid in await list_external_contacts(staff_userid):
        try:
            detail = await get_external_contact(eid)
        except Exception:
            logger.warning("cercus_contact_detail_failed", external_userid=eid)
            continue
        info = detail.get("external_contact", {})
        # 备注手机号：follow_user 列表中带 remark_mobile 的第一条
        remark_mobile = ""
        for fu in detail.get("follow_user", []):
            if fu.get("remark_mobiles"):
                remark_mobile = fu["remark_mobiles"][0]
                break
        out.append(
            {
                "external_userid": eid,
                "name": info.get("name") or info.get("nickname") or "",
                "unionid": info.get("unionid") or "",
                "avatar": info.get("avatar") or "",
                "remark_mobile": remark_mobile,
                "staff_userid": staff_userid,
                "synced_at": datetime.datetime.now(datetime.UTC),
            }
        )
    return out
