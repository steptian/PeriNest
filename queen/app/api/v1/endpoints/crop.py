"""Crop (嗦囊) — RAG 知识库端点：先吞后消化。

- POST   /crop/documents          上传文本知识（crop:write）
- GET    /crop/documents          文档列表（crop:read）
- GET    /crop/documents/stats    状态聚合=批量入库进度（crop:read）
- POST   /crop/documents/batch    批量入库：提取+入队即回 202（crop:write，Celery 消化）
- GET    /crop/documents/{id}     详情+chunks（crop:read）
- POST   /crop/documents/{id}/retry  重试 failed 文档（crop:write）
- DELETE /crop/documents/{id}     删除（crop:write）
- POST   /crop/search             语义检索（crop:read，四端共享）
- POST   /crop/ask                知识库问答：AI 多轮检索后作答（crop:read）
- POST   /crop/ask/stream         流式问答 SSE（crop:read，conversation_id 续聊）
- GET    /crop/conversations      本人会话列表（crop:read）
- GET    /crop/conversations/{id} 会话消息详情（crop:read）
- GET    /crop/usage/summary      问答用量汇总（crop:read，admin 全局/本人）
- POST   /crop/projection/rebuild 重建 Redis 投影（crop:write，运维备手）
- GET    /crop/health             投影健康（crop:read）
"""
import json

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser, DBSession
from app.models.user import User
from app.core.permissions import CROP, require_permission
from app.schemas.request import CropAskRequest, CropDocumentCreate, CropSearchRequest
from app.schemas.response import (
    CropChunkResponse,
    CropDocumentResponse,
    CropSearchResponse,
)
from app.services import crop_service
from app.services.ai_service import AIServiceUnavailable

router = APIRouter(prefix="/crop", tags=["crop"])


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status

from app.api.deps import CurrentUser, DBSession
from app.models.user import User
from app.core.permissions import CROP, require_permission
from app.schemas.request import CropDocumentCreate, CropSearchRequest
from app.schemas.response import (
    CropChunkResponse,
    CropDocumentResponse,
    CropSearchResponse,
)
from app.services import crop_service

router = APIRouter(prefix="/crop", tags=["crop"])


@router.post(
    "/documents",
    status_code=status.HTTP_201_CREATED,
    response_model=CropDocumentResponse,
)
async def create_document(
    req: CropDocumentCreate,
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:write")),
):
    doc = await crop_service.create_document(db, req, user.id)
    await db.commit()
    return CropDocumentResponse.model_validate(doc)


@router.post(
    "/documents/upload",
    status_code=status.HTTP_201_CREATED,
    response_model=CropDocumentResponse,
)
async def upload_document(
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:write")),
    file: UploadFile = File(description="txt/md/pdf/docx，≤10MB"),
    title: str = Query(default="", max_length=255),
    visible_roles: str = Query(default="", max_length=255, pattern=r"^[a-z0-9_]+(,[a-z0-9_]+)*$|^$"),
):
    """文件吞入：按格式提取文字层 → 复用 create_document（分块+向量+投影）。

    扫描件 PDF（无文字层）/ 加密文件明确 422——OCR 不在模板范围。
    """
    raw = await file.read()
    try:
        text, source_type = crop_service.extract_text(file.filename or "", raw)
    except crop_service.UploadUnsupported as e:
        raise HTTPException(status_code=422, detail=str(e))
    doc_title = title.strip() or (file.filename or "未命名").rsplit(".", 1)[0]
    req = CropDocumentCreate(title=doc_title, content=text, source_type=source_type,
                             visible_roles=visible_roles or None)
    doc = await crop_service.create_document(
        db, req, user.id,
        original_file=(file.filename or doc_title, file.content_type or "application/octet-stream", raw),
    )
    await db.commit()
    return CropDocumentResponse.model_validate(doc)


@router.get("/documents", response_model=list[CropDocumentResponse])
async def list_documents(
    response: "Response",
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    docs, total = await crop_service.list_documents(db, limit, offset, user)
    response.headers["X-Total-Count"] = str(total)
    return [CropDocumentResponse.model_validate(d) for d in docs]


@router.get("/documents/stats")
async def document_stats(
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
):
    """文档状态聚合：批量入库进度（ready/queued/embedding/failed/pending）。"""
    return await crop_service.document_stats(db)


@router.post(
    "/documents/batch",
    status_code=status.HTTP_202_ACCEPTED,
)  # noqa: E125
async def batch_upload_documents(
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:write")),
    files: list[UploadFile] = File(description="txt/md/pdf/docx，可多选"),
    visible_roles: str = Query(default="", max_length=255, pattern=r"^[a-z0-9_]+(,[a-z0-9_]+)*$|^$"),
):
    """批量入库：每个文件仅做「提取文本 + 建 queued 文档行」即返回 202；

    向量化消化由 Celery crop.ingest_batch 串行执行（前端轮询文档状态看进度）。
    单文件提取失败（如扫描件 PDF）只记 rejected 不炸整批。
    """
    accepted_ids: list[int] = []
    rejected: list[dict] = []
    for file in files:
        filename = file.filename or "未命名"
        raw = await file.read()
        try:
            text, source_type = crop_service.extract_text(filename, raw)
        except crop_service.UploadUnsupported as e:
            rejected.append({"filename": filename, "reason": str(e)})
            continue
        title = filename.rsplit(".", 1)[0]
        req = CropDocumentCreate(
            title=title, content=text, source_type=source_type,
            visible_roles=visible_roles or None,
        )
        doc = await crop_service.register_document(
            db, req, user.id,
            original_file=(filename, file.content_type or "application/octet-stream", raw),
        )
        accepted_ids.append(doc.id)
    await db.commit()

    if accepted_ids:
        # 落库后才投递，确保 worker 可见 queued 文档
        from app.tasks.crop_tasks import crop_ingest_batch
        crop_ingest_batch.delay(accepted_ids)

    return {
        "accepted": len(accepted_ids),
        "document_ids": accepted_ids,
        "rejected": rejected,
        "queue": "crop.ingest_batch",
    }

@router.get("/documents/{doc_id}")
async def get_document(
    doc_id: int,
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
):
    doc = await crop_service.get_document(db, doc_id, user)
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")
    chunks = await crop_service.get_chunks(db, doc_id)
    return {
        "document": CropDocumentResponse.model_validate(doc).model_dump(),
        "chunks": [
            CropChunkResponse(
                document_id=c.document_id, seq=c.seq, content=c.content
            ).model_dump()
            for c in chunks
        ],
    }


@router.get("/documents/{doc_id}/file")
async def get_document_file(
    doc_id: int,
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
):
    """源文件预览/下载：上传原件原样返回（inline，浏览器可预览 PDF/txt）。"""
    doc = await crop_service.get_document(db, doc_id, user)
    if doc is None or not doc.file_blob:
        raise HTTPException(status_code=404, detail="源文件不存在（文本粘贴型文档无原件）")
    from fastapi.responses import Response as FastResponse

    return FastResponse(
        content=doc.file_blob,
        media_type=doc.file_mime or "application/octet-stream",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(doc.original_filename or str(doc_id))}",
        },
    )


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    db: DBSession,
    _user: User = Depends(require_permission(f"{CROP}:write")),
):
    ok = await crop_service.delete_document(db, doc_id)
    await db.commit()
    if not ok:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {"ok": True}


@router.post(
    "/documents/{doc_id}/retry",
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_document(
    doc_id: int,
    db: DBSession,
    _user: User = Depends(require_permission(f"{CROP}:write")),
):
    """手动重试失败文档：failed → queued → 重入队（worker 消化）。非 failed 409。"""
    doc = await crop_service.retry_failed_document(db, doc_id)
    if doc is None:
        raise HTTPException(status_code=409, detail="仅 failed 状态可重试（或文档不存在）")
    await db.commit()
    from app.tasks.crop_tasks import crop_ingest_batch
    crop_ingest_batch.delay([doc_id])
    return {"ok": True, "status": "queued"}


@router.post("/search", response_model=CropSearchResponse)
async def search(
    req: CropSearchRequest,
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
):
    """语义检索 top-k chunk。权限语义：检索前过滤（全库共享 + 可见角色命中的文档）。"""
    hits, mock = await crop_service.search(db, req.query, req.top_k, user)
    return CropSearchResponse(query=req.query, mock=mock, hits=hits)



@router.post("/ask")
async def ask(
    req: CropAskRequest,
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
) -> dict:
    """知识库问答：AI 自主多轮检索后作答（带引用）——agentic RAG。

    conversation_id 有值时自动加载会话历史并在成功后追加消息（多轮续聊）。
    无真实 LLM 时 503（fail-closed：知识库问答不 mock 假答案）。
    """
    try:
        answer, citations = await crop_service.ask(
            db, user, req.query, req.history, req.top_k,
            session_id=req.conversation_id,
        )
    except AIServiceUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    await db.commit()  # 会话消息（如有）随事务落库
    return {"answer": answer, "citations": citations}


@router.post("/ask/stream")
async def ask_stream(
    req: CropAskRequest,
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
) -> StreamingResponse:
    """流式问答 SSE。事件：{tool_call} → {delta}* → {citations} → {done}。

    conversation_id 有值时服务端续聊（历史自动加载，答案自动入库）。
    """

    async def gen():
        try:
            async for ev in crop_service.ask_stream(
                db, user, req.query, req.history, req.top_k,
                session_id=req.conversation_id,
            ):
                yield _sse(ev)
            await db.commit()  # 会话消息随事务落库（流结束后）
            yield _sse({"done": True})
        except AIServiceUnavailable as e:
            yield _sse({"error": str(e)})
        except Exception as e:  # noqa: BLE001 — SSE 通道内异常必须转文本下发，不能断流
            yield _sse({"error": f"问答服务异常: {e}"})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

@router.post("/projection/rebuild")
async def rebuild_projection(
    db: DBSession,
    _user: User = Depends(require_permission(f"{CROP}:write")),
):
    """从 MySQL 权威全量重建 Redis 投影（权威/投影分离的运维兑现点）。"""
    count = await crop_service.rebuild_projection(db)
    return {"rebuilt": count}


@router.get("/health")
async def crop_health(
    _user: User = Depends(require_permission(f"{CROP}:read")),
):
    return await crop_service.projection_health()


@router.get("/conversations")
async def list_conversations(
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
    limit: int = Query(default=30, ge=1, le=100),
):
    """本人问答会话列表（最近活动倒序）。"""
    from app.services import agent_service

    return await agent_service.list_conversations(db, user, limit)


@router.get("/conversations/{session_id}")
async def get_conversation(
    session_id: str,
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
):
    """会话消息详情（仅本人会话；不存在/越权 404）。"""
    from app.services import agent_service

    messages = await agent_service.get_conversation(db, session_id, user)
    if messages is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"session_id": session_id, "messages": messages}


@router.put("/conversations/{session_id}/title")
async def set_conversation_title(
    session_id: str,
    req: dict,
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
):
    """自定义会话标题（本人会话）。body: {"title": "..."}"""
    from app.services import agent_service

    title = str(req.get("title", "")).strip()
    if not title:
        raise HTTPException(status_code=422, detail="标题不能为空")
    ok = await agent_service.set_title(db, session_id, user, title)
    if not ok:
        raise HTTPException(status_code=404, detail="会话不存在")
    await db.commit()
    return {"ok": True, "title": title[:64]}


@router.get("/usage/summary")
async def usage_summary(
    db: DBSession,
    user: User = Depends(require_permission(f"{CROP}:read")),
    days: int = Query(default=7, ge=1, le=90),
):
    """问答用量汇总（近 N 天）：admin 见全局，普通用户仅本人。"""
    from app.services import agent_service

    return await agent_service.usage_summary(user, days)
