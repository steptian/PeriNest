"""Crop (嗉囊) — RAG 知识库端点：先吞后消化。

- POST   /crop/documents          上传文本知识（crop:write）
- GET    /crop/documents          文档列表（crop:read）
- GET    /crop/documents/{id}     详情+chunks（crop:read）
- DELETE /crop/documents/{id}     删除（crop:write）
- POST   /crop/search             语义检索（crop:read，四端共享）
- POST   /crop/projection/rebuild 重建 Redis 投影（crop:write，运维备手）
- GET    /crop/health             投影健康（crop:read）
"""
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
    req = CropDocumentCreate(title=doc_title, content=text, source_type=source_type)
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
    _user: User = Depends(require_permission(f"{CROP}:read")),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    docs, total = await crop_service.list_documents(db, limit, offset)
    response.headers["X-Total-Count"] = str(total)
    return [CropDocumentResponse.model_validate(d) for d in docs]


@router.get("/documents/{doc_id}")
async def get_document(
    doc_id: int,
    db: DBSession,
    _user: User = Depends(require_permission(f"{CROP}:read")),
):
    doc = await crop_service.get_document(db, doc_id)
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
    _user: User = Depends(require_permission(f"{CROP}:read")),
):
    """源文件预览/下载：上传原件原样返回（inline，浏览器可预览 PDF/txt）。"""
    doc = await crop_service.get_document(db, doc_id)
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


@router.post("/search", response_model=CropSearchResponse)
async def search(
    req: CropSearchRequest,
    db: DBSession,
    _user: User = Depends(require_permission(f"{CROP}:read")),
):
    """语义检索 top-k chunk。权限语义：crop:read 可检索全库共享知识。"""
    hits, mock = await crop_service.search(db, req.query, req.top_k)
    return CropSearchResponse(query=req.query, mock=mock, hits=hits)


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
