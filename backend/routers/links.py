from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter(prefix="/api/links", tags=["links"])


@router.get("")
def list_links(db: Session = Depends(get_db)):
    prod = {p.id: p.title for p in db.query(models.Product).all()}
    out = []
    for l in db.query(models.Link).order_by(models.Link.created_at.desc()).all():
        d = l.serialize(); d["product_title"] = prod.get(l.product_id, "—"); out.append(d)
    return out
