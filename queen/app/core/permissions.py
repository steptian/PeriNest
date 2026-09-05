"""Carapace 权限矩阵（唯一事实源）——后端。

角色 → 权限点映射，前后端同源（Wing 端菜单按 effective permissions 渲染）。

权限点格式:
- 域           : 该域读写全有（简写，按 HTTP 方法自动判定 read/write）
- 域:read      : 只读
- 域:write     : 可写（隐含 read：能写必能读）

权限域（蜚蠊解剖对应）:
- users:    用户管理（cephalon 头 · 账号/角色/覆盖）
- orders:   订单业务（thorax 胸）
- feedback: 反馈日志（abdomen 腹）
- ai:       AI 网关（nerve 神经索 + spiracle 气门）
- system:   系统管理（配置/健康/版本）

角色矩阵（2026-09-05 确立）:
┌─────────────┬───────┬────────┬──────────┬─────┬──────────┐
│ 角色        │ users │ orders │ feedback │ ai  │ system   │
├─────────────┼───────┼────────┼──────────┼─────┼──────────┤
│ admin       │ ✅    │ ✅     │ ✅       │ ✅  │ ✅       │
│ operator    │ :read │ ✅     │ ✅       │ ✅  │ ❌       │
│ wing        │ ❌    │ ✅*    │ ✅*      │ ✅  │ ❌       │
│ antenna     │ ❌    │ ✅*    │ ✅*      │ ✅  │ ❌       │
└─────────────┴───────┴────────┴──────────┴─────┴──────────┘
* wing/antenna 的"本人的/自己的"= 数据归属过滤，由 Service 层强制
 （权限域管"能不能用"，归属过滤管"能看谁的"——两层分离）。

账号级覆盖（pn_perm_override）:
  最终权限 = 角色模板 ⊕ 账号覆盖（grant 追加 / deny 撤销，deny 绝对优先）
  仅非 admin 角色可覆盖（admin 锁死全域，防自锁）。

变更纪律:
1. 改矩阵 = 同时改本文件 + 前端权限展示 + 测试矩阵用例
2. 禁止在业务代码里写 role ==/!= 判断，一律走 require_permission
3. fail closed：未知角色无任何权限
"""
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import CurrentUser
from app.models.user import User

# ---- 权限域 ----
USERS = "users"
ORDERS = "orders"
FEEDBACK = "feedback"
AI = "ai"
SYSTEM = "system"
ALL_PERMS = [USERS, ORDERS, FEEDBACK, AI, SYSTEM]

READ = "read"
WRITE = "write"
_READ_METHODS = {"GET", "HEAD", "OPTIONS"}

ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": ALL_PERMS,
    "operator": [f"{USERS}:{READ}", ORDERS, FEEDBACK, AI],
    # 终端用户：能"用"订单/反馈/AI 域；"只见自己的"由 Service 层归属过滤强制
    "wing": [ORDERS, FEEDBACK, AI],
    "antenna": [ORDERS, FEEDBACK, AI],
}

ROLE_NAMES = {
    "admin": "管理员",
    "operator": "运营",
    "wing": "终端用户(Web)",
    "antenna": "终端用户(微信)",
}


def _parse_perm(perm: str) -> tuple[str, str | None]:
    """"users:write" -> ("users", "write")；"orders" -> ("orders", None)"""
    if ":" in perm:
        domain, action = perm.split(":", 1)
        return domain, action
    return perm, None


def _check_perm(perms: list[str], domain: str, action: str) -> bool:
    """域简写=读写全有；域:write 隐含 域:read。"""
    if f"{domain}:{action}" in perms:
        return True
    if domain in perms:
        return True
    if action == READ and f"{domain}:{WRITE}" in perms:
        return True
    return False


def base_permissions(role: str) -> list[str]:
    """角色 → 权限点；未知角色无权限（fail closed）。"""
    return ROLE_PERMISSIONS.get(role, [])


def apply_overrides(base_perms: list[str], overrides) -> list[str]:
    """角色模板 ⊕ 账号覆盖：deny 移除（绝对优先），grant 追加（不复活被 deny 的点）。"""
    denied = {o.perm for o in overrides if o.effect == "deny"}
    granted = [o.perm for o in overrides if o.effect == "grant" and o.perm not in denied]
    result = [p for p in base_perms if p not in denied]
    for p in granted:
        if p not in result:
            result.append(p)
    return result


async def effective_permissions(user: User, db: AsyncSession) -> list[str]:
    """账号最终权限 = 角色模板 ⊕ 账号覆盖。鉴权与前端下发的唯一入口。"""
    base = base_permissions(user.role)
    if user.role == "admin":
        return base  # admin 锁死，不可覆盖
    from app.models.perm_override import PermOverride

    rows = (
        await db.execute(select(PermOverride).where(PermOverride.user_id == user.id))
    ).scalars().all()
    return apply_overrides(base, rows)


def require_permission(perm: str):
    """接口权限依赖：要求当前用户具备权限点。纯域简写按 HTTP 方法自动判定。

    用法: user: User = Depends(require_permission("users"))
          user: User = Depends(require_permission("users:write"))
    """
    domain, action = _parse_perm(perm)

    async def _checker(
        request: Request,
        user: CurrentUser,
        db: AsyncSession = Depends(get_db),
    ) -> User:
        need_action = action or (READ if request.method in _READ_METHODS else WRITE)
        perms = await effective_permissions(user, db)
        if not _check_perm(perms, domain, need_action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"无权限：需要「{domain}:{need_action}」"
                    f"（当前角色：{ROLE_NAMES.get(user.role, user.role)}）"
                ),
            )
        return user

    return _checker
