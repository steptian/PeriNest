"""Crop（嗉囊）RAG 知识库全链路测试。

覆盖：权限门（wing 403 / admin 放行）、ingest→分块→embedding→投影、
语义检索命中、删除、权威/投影重建、MCP crop_search 工具。
CI 环境：embedding mock（哈希伪向量）+ 本地 Redis 8 Vector Sets。
"""
import json
import uuid

import pytest


def _rpc(method: str, params: dict = {}, id: int = 1) -> dict:
    return {"jsonrpc": "2.0", "id": id, "method": method, "params": params}


def _call(name: str, arguments: dict | None = None, id: int = 1) -> dict:
    return _rpc("tools/call", {"name": name, "arguments": arguments or {}}, id)


def _payload(resp) -> dict:
    return json.loads(resp.json()["result"]["content"][0]["text"])


async def _mk_admin(client):
    """造 admin 并返回（headers, user_id）。"""
    from app.core.database import AsyncSessionLocal
    from app.core.security import create_access_token
    from app.schemas.request import RegisterRequest
    from app.services import user_service

    uname = f"cropadmin_{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        user = await user_service.register(
            db,
            RegisterRequest(username=uname, password="PeriNest!2026", email=f"{uname}@example.com"),
        )
        user.role = "admin"
        db.add(user)
        await db.commit()
        token = create_access_token(subject=str(user.id))
    return {"Authorization": f"Bearer {token}"}, user.id


KNOWLEDGE = """PeriNest 是一个四端企业级模板项目。

Queen 是后端核心，负责业务裁决。Wing 是管理端。

Crop 嗦囊是知识库模块，先吞后消化。向量化后可语义检索。

琥珀标本馆是 UI 设计语言：琥珀金、树脂棕、米纸底。"""


async def test_crop_write_permission_gate(client, auth_headers):
    """wing 用户（无 crop:write）上传被 403 拒——fail closed。"""
    resp = await client.post(
        "/api/v1/crop/documents",
        headers=auth_headers,
        json={"title": "t", "content": "x" * 20},
    )
    assert resp.status_code == 403


async def test_crop_ingest_search_delete_flow(client):
    """全链路：admin 上传 → 检索命中 → 详情 → 删除。"""
    headers, _ = await _mk_admin(client)

    # 上传
    resp = await client.post(
        "/api/v1/crop/documents",
        headers=headers,
        json={"title": "PeriNest 简介", "content": KNOWLEDGE},
    )
    assert resp.status_code == 201, resp.text
    doc = resp.json()
    assert doc["status"] == "ready"
    assert doc["chunk_count"] >= 1
    doc_id = doc["id"]

    # 检索命中（mock 伪向量：同词必召回）
    resp = await client.post(
        "/api/v1/crop/search", headers=headers,
        json={"query": "知识库 检索", "top_k": 3},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["mock"] is True  # CI 未配 embedding key
    assert len(data["hits"]) >= 1
    top = data["hits"][0]
    assert top["score"] > 0
    assert "嗉囊" in top["content"] or "检索" in top["content"]

    # 详情含 chunks
    resp = await client.get(f"/api/v1/crop/documents/{doc_id}", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()["chunks"]) == doc["chunk_count"]

    # 删除后再检索无此文档
    resp = await client.delete(f"/api/v1/crop/documents/{doc_id}", headers=headers)
    assert resp.status_code == 200
    resp = await client.post(
        "/api/v1/crop/search", headers=headers, json={"query": "嗉囊"}
    )
    hit_docs = {h["document_id"] for h in resp.json()["hits"]}
    assert doc_id not in hit_docs


async def test_crop_projection_rebuild(client):
    """权威/投影分离：清空 Redis 投影后从 MySQL 重建，检索恢复。"""
    from app.services import crop_vector_store

    headers, _ = await _mk_admin(client)
    resp = await client.post(
        "/api/v1/crop/documents",
        headers=headers,
        json={"title": f"rebuild_{uuid.uuid4().hex[:6]}", "content": KNOWLEDGE},
    )
    doc_id = resp.json()["id"]

    # 模拟投影丢失（DEL vector set）
    import redis.asyncio as aioredis
    r = aioredis.from_url("redis://127.0.0.1:6379/0", decode_responses=False)
    await r.delete(crop_vector_store.VECTOR_KEY)
    await r.aclose()

    resp = await client.post("/api/v1/crop/search", headers=headers, json={"query": "嗉囊"})
    assert resp.json()["hits"] == []  # 投影丢了检索为空（权威还在）

    # 重建
    resp = await client.post("/api/v1/crop/projection/rebuild", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["rebuilt"] > 0

    resp = await client.post("/api/v1/crop/search", headers=headers, json={"query": "嗉囊"})
    assert any(h["document_id"] == doc_id for h in resp.json()["hits"])


async def test_mcp_crop_tools(client, auth_headers):
    """MCP：wing 可 crop_search（crop:read），crop_ingest 被拒（无 crop:write）。"""
    headers, _ = await _mk_admin(client)
    await client.post(
        "/api/v1/crop/documents",
        headers=headers,
        json={"title": f"mcp_{uuid.uuid4().hex[:6]}", "content": KNOWLEDGE},
    )

    # wing（auth_headers）检索：权限通过
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers,
        json=_call("crop_search", {"query": "琥珀 设计", "top_k": 2}),
    )
    data = _payload(resp)
    assert data["mock_embedding"] is True
    assert len(data["hits"]) >= 1

    # wing 上传：denied
    resp = await client.post(
        "/api/v1/mcp", headers=auth_headers,
        json=_call("crop_ingest", {"title": "x", "content": "y" * 20}),
    )
    data = _payload(resp)
    assert data["denied"] is True and "crop" in data["reason"]

    # admin 上传：成功且归属 admin
    resp = await client.post(
        "/api/v1/mcp", headers=headers,
        json=_call("crop_ingest", {"title": f"ok_{uuid.uuid4().hex[:6]}", "content": KNOWLEDGE}),
    )
    data = _payload(resp)
    assert data["ingested"] is True


async def test_crop_unknown_field_rejected(client, auth_headers):
    """StrictRequest fail-closed 守住 crop 契约面。"""
    resp = await client.post(
        "/api/v1/crop/search", headers=auth_headers,
        json={"query": "x", "topk": 5},
    )
    assert resp.status_code == 422
