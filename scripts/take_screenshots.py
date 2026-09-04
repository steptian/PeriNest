"""README 演示截图生成器 — Playwright 设备视口截图。

用法：先起 queen(8000) + wing(5173) + leg(5174) dev，再跑本脚本。
输出：assets/screenshots/*.png
"""
import asyncio
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

OUT = Path(__file__).resolve().parent.parent / "assets" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

API = "http://localhost:8000/api/v1"
LEG = "http://localhost:5174"
WING = "http://localhost:5173"

DEMO_USER = {"username": "smoke_user_001", "password": "PeriNest!2026"}


async def get_token() -> str:
    import httpx

    r = await httpx.AsyncClient().post(f"{API}/auth/login", json=DEMO_USER)
    return r.json()["access_token"]


def auth_script(token: str, app: str) -> str:
    import json

    state = json.dumps(
        {
            "state": {
                "token": token,
                "user": {
                    "id": 4,
                    "username": "demo_user",
                    "email": None,
                    "role": "wing",
                    "is_active": True,
                    "created_at": "2026-09-04",
                },
            },
            "version": 0,
        }
    )
    return f"localStorage.setItem('perinest-{app}-auth', '{state}');"


async def leg_chat(page, token, dark: bool):
    theme = "document.documentElement.classList.add('dark');" if dark else ""
    await page.add_init_script(auth_script(token, "leg") + theme)
    await page.goto(f"{LEG}/chat")
    await page.wait_for_selector('input[placeholder="问点什么…"]')
    await page.fill('input[placeholder="问点什么…"]', "用一句话夸夸坚持开源的程序员")
    await page.click("button.rounded-full")
    # 等流式回复：用户气泡出现后，轮询最后一页文本稳定
    await page.wait_for_timeout(2000)
    last, stable = "", 0
    for _ in range(40):
        await page.wait_for_timeout(800)
        try:
            txt = await page.inner_text("div.whitespace-pre-wrap >> nth=-1")
        except Exception:
            txt = ""
        if txt == last and len(txt) > 20:
            stable += 1
            if stable >= 2:
                break
        else:
            stable = 0
        last = txt
    name = f"leg-chat-{'dark' if dark else 'light'}.png"
    await page.screenshot(path=str(OUT / name), full_page=False)
    print("saved", name)


async def wing_dashboard(page, token, dark: bool):
    theme = "document.documentElement.classList.add('dark');" if dark else ""
    await page.add_init_script(auth_script(token, "wing") + theme)
    await page.goto(f"{WING}/")
    await page.wait_for_selector("text=仪表盘")
    await page.wait_for_timeout(800)
    name = f"wing-dashboard-{'dark' if dark else 'light'}.png"
    await page.screenshot(path=str(OUT / name), full_page=False)
    print("saved", name)


async def main():
    token = await get_token()
    only = sys.argv[1] if len(sys.argv) > 1 else "all"
    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # Leg：iPhone 视口
        leg_ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
        )
        leg_page = await leg_ctx.new_page()
        if only in ("all", "leg"):
            await leg_chat(leg_page, token, dark=False)
            await leg_ctx.close()
            leg_ctx = await browser.new_context(
                viewport={"width": 390, "height": 844},
                device_scale_factor=2,
                is_mobile=True,
                color_scheme="dark",
            )
            leg_page = await leg_ctx.new_page()
            await leg_chat(leg_page, token, dark=True)
        await leg_ctx.close()

        # Wing：桌面视口
        if only in ("all", "wing"):
            for dark in (False, True):
                wing_ctx = await browser.new_context(
                    viewport={"width": 1440, "height": 900},
                    device_scale_factor=2,
                    color_scheme="dark" if dark else "light",
                )
                wing_page = await wing_ctx.new_page()
                await wing_dashboard(wing_page, token, dark)
                await wing_ctx.close()

        await browser.close()


asyncio.run(main())
