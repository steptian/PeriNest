"""首次引导：把指定用户提升为 admin（或创建新 admin）。

用途：clone 后第一个管理员从这里来。鸡生蛋问题的官方出口。

用法：
    python scripts/seed_admin.py <username>              # 已有用户提权
    python scripts/seed_admin.py <username> --password X # 不存在则创建
    make admin USER=xxx
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.user import User  # noqa: E402


async def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    username = sys.argv[1]
    password = None
    if "--password" in sys.argv:
        password = sys.argv[sys.argv.index("--password") + 1]

    async with AsyncSessionLocal() as db:
        user = (
            await db.execute(select(User).where(User.username == username))
        ).scalar_one_or_none()
        if user is None:
            if not password:
                print(f"用户 {username} 不存在；用 --password 创建新 admin")
                sys.exit(1)
            user = User(username=username, email=None,
                        hashed_password=hash_password(password), role="admin")
            db.add(user)
            print(f"✅ 已创建 admin: {username}")
        else:
            user.role = "admin"
            db.add(user)
            print(f"✅ 已提权为 admin: {username} (原角色已覆盖)")
        await db.commit()


asyncio.run(main())
