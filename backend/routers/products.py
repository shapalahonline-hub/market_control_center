from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter(prefix="/api/products", tags=["products"])


class ProductIn(BaseModel):
    kaspi_sku: Optional[str] = None
    title: str
    category: Optional[str] = None
    kaspi_url: Optional[str] = None
    image_url: Optional[str] = None
    price_kzt: float = 0
    active: bool = True
    notes: Optional[str] = None


@router.get("")
def list_products(db: Session = Depends(get_db)):
    return [p.serialize() for p in db.query(models.Product).order_by(models.Product.title).all()]


@router.post("")
def create_product(body: ProductIn, db: Session = Depends(get_db)):
    p = models.Product(**body.model_dump())
    db.add(p); db.commit(); db.refresh(p)
    return p.serialize()


@router.patch("/{pid}")
def update_product(pid: int, body: ProductIn, db: Session = Depends(get_db)):
    p = db.get(models.Product, pid)
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit(); db.refresh(p)
    return p.serialize()


class ImportBody(BaseModel):
    text: str  # lines: sku | title | category | price | kaspi_url


@router.post("/import")
def import_products(body: ImportBody, db: Session = Depends(get_db)):
    n = 0
    for line in body.text.splitlines():
        parts = [c.strip() for c in line.split("|")]
        if len(parts) < 2 or not parts[1]:
            continue
        sku = parts[0] or None
        if sku and db.query(models.Product).filter(models.Product.kaspi_sku == sku).first():
            continue
        price = 0.0
        if len(parts) > 3:
            try:
                price = float(str(parts[3]).replace(" ", "").replace(",", "."))
            except ValueError:
                price = 0.0
        db.add(models.Product(
            kaspi_sku=sku, title=parts[1],
            category=parts[2] if len(parts) > 2 else None,
            price_kzt=price,
            kaspi_url=parts[4] if len(parts) > 4 else None,
        ))
        n += 1
    db.commit()
    return {"imported": n}
