"""Crop 嗦囊业务（RAG 知识库 ingest + 检索）。

权限逻辑只写在这里（共生体原则：REST 与 MCP 复用同一份）。
分块策略 v1：按段落聚合，~600 字一块，中文优先。
"""
import structlog
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crop import CropChunk, CropDocument
from app.schemas.request import CropDocumentCreate
from app.services import crop_vector_store
from app.services.embedding_service import embed_texts, pack_vector

logger = structlog.get_logger(__name__)

CHUNK_TARGET_CHARS = 600  # 段落聚合目标块大小


def split_chunks(content: str, target: int = CHUNK_TARGET_CHARS) -> list[str]:
    """段落聚合分块：空行分段，段落顺序装填，超过 target 截断开新块。"""
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    chunks: list[str] = []
    buf = ""
    for para in paragraphs:
        if len(buf) + len(para) + 2 <= target:
            buf = f"{buf}\n\n{para}" if buf else para
        else:
            if buf:
                chunks.append(buf)
            # 单段超长：硬切
            while len(para) > target:
                chunks.append(para[:target])
                para = para[target:]
            buf = para
    if buf:
        chunks.append(buf)
    return chunks or [content[:target]]


async def create_document(
    db: AsyncSession, req: CropDocumentCreate, user_id: int | None
) -> CropDocument:
    """吞入+消化：建文档 → 分块 → embedding → 存权威 → 投影到 Redis。

    v1 同步处理（文本量级毫秒完成）；大文件异步化留给 v2（Celery）。
    """
    doc = CropDocument(
        title=req.title,
        source_type=req.source_type,
        content=req.content,
        size_bytes=len(req.content.encode("utf-8")),
        status="embedding",
        created_by=user_id,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)  # server_default 字段回读（见 01 文档铁坑）

    chunks = split_chunks(req.content)
    try:
        vectors, _mock = await embed_texts(chunks)
        for seq, (text, vec) in enumerate(zip(chunks, vectors)):
            chunk = CropChunk(
                document_id=doc.id,
                seq=seq,
                content=text,
                token_count=len(text),
                embedding=pack_vector(vec),
                embedding_model="mock" if _mock else "api",
            )
            db.add(chunk)
        doc.chunk_count = len(chunks)
        doc.status = "ready"
    except Exception as exc:
        doc.status = "failed"
        doc.error = str(exc)[:500]
        await db.flush()
        raise

    await db.flush()
    # 权威已落库（事务内），投影事务外追加（投影可丢，失败不影响权威）
    rows = (
        await db.execute(
            select(CropChunk.id, CropChunk.embedding).where(
                CropChunk.document_id == doc.id
            )
        )
    ).all()
    for chunk_id, packed in rows:
        await crop_vector_store.add(chunk_id, packed)
    logger.info(
        "crop_ingested", document_id=doc.id, chunks=len(chunks)
    )
    return doc


async def list_documents(
    db: AsyncSession, limit: int = 20, offset: int = 0
) -> tuple[list[CropDocument], int]:
    total = (await db.execute(select(func.count(CropDocument.id)))).scalar_one()
    rows = (
        await db.execute(
            select(CropDocument)
            .order_by(CropDocument.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return list(rows), total


async def get_document(db: AsyncSession, doc_id: int) -> CropDocument | None:
    return await db.get(CropDocument, doc_id)


async def get_chunks(db: AsyncSession, doc_id: int) -> list[CropChunk]:
    rows = (
        await db.execute(
            select(CropChunk)
            .where(CropChunk.document_id == doc_id)
            .order_by(CropChunk.seq)
        )
    ).scalars().all()
    return list(rows)


async def delete_document(db: AsyncSession, doc_id: int) -> bool:
    """删权威（chunk 级联）+ 删投影。"""
    doc = await get_document(db, doc_id)
    if doc is None:
        return False
    chunk_ids = (
        await db.execute(select(CropChunk.id).where(CropChunk.document_id == doc_id))
    ).scalars().all()
    await db.execute(delete(CropChunk).where(CropChunk.document_id == doc_id))
    await db.delete(doc)
    for cid in chunk_ids:
        await crop_vector_store.drop_chunk(cid)
    return True


async def search(
    db: AsyncSession, query: str, top_k: int = 5
) -> tuple[list[dict], bool]:
    """检索：embed query → Redis KNN → 回 MySQL 取 chunk+文档拼装。"""
    from app.schemas.response import CropSearchHit

    vectors, mock = await embed_texts([query])
    packed = pack_vector(vectors[0])
    hits = await crop_vector_store.search(packed, top_k)
    if not hits:
        return [], mock

    chunk_ids = [cid for cid, _ in hits]
    rows = (
        await db.execute(
            select(CropChunk, CropDocument)
            .join(CropDocument, CropChunk.document_id == CropDocument.id)
            .where(CropChunk.id.in_(chunk_ids))
        )
    ).all()
    by_id = {chunk.id: (chunk, doc) for chunk, doc in rows}
    results: list[CropSearchHit] = []
    for cid, score in hits:  # 保持相似度排序
        pair = by_id.get(cid)
        if pair is None:
            continue  # 投影与权威短暂不一致（重建窗口），跳过
        chunk, doc = pair
        results.append(
            CropSearchHit(
                chunk_id=chunk.id,
                document_id=doc.id,
                document_title=doc.title,
                seq=chunk.seq,
                content=chunk.content,
                score=round(score, 4),
            )
        )
    return [r.model_dump() for r in results], mock


async def rebuild_projection(db: AsyncSession) -> int:
    """从 MySQL 权威全量重建 Redis 投影（运维/灾后备手）。"""
    rows = (
        await db.execute(select(CropChunk.id, CropChunk.embedding))
    ).all()
    return await crop_vector_store.rebuild(rows)


async def projection_health() -> dict:
    """投影健康（管理端观测）。"""
    return {"vector_set": crop_vector_store.VECTOR_KEY, "count": await crop_vector_store.card()}
