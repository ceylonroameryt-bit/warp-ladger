"""
Warp Ladger — Organisations Router
"""
import uuid

from fastapi import APIRouter, Depends

from app.audit.service import AuditService
from app.core.dependencies import CurrentUser, DBSession, VerifiedUser, require_permission
from app.organisations.schemas import (
    CreateOrganisationRequest,
    OrganisationDetailResponse,
    OrganisationResponse,
    UpdateOrganisationRequest,
)
from app.organisations.service import OrganisationService

router = APIRouter()


@router.get("/", response_model=list[OrganisationResponse])
async def list_my_organisations(current_user: VerifiedUser, db: DBSession):
    """List all organisations the current user belongs to."""
    svc = OrganisationService(db)
    return await svc.list_user_organisations(current_user.id)


@router.post("/", response_model=OrganisationDetailResponse, status_code=201)
async def create_organisation(
    body: CreateOrganisationRequest,
    current_user: VerifiedUser,
    db: DBSession,
):
    """Create a new organisation. Current user becomes the owner."""
    svc = OrganisationService(db)
    org = await svc.create_organisation(
        name=body.name,
        owner_id=current_user.id,
        slug=body.slug,
        currency=body.currency,
        timezone=body.timezone,
    )
    audit = AuditService(db)
    await audit.log(
        action="org.created",
        resource_type="organisation",
        resource_id=str(org.id),
        organisation_id=org.id,
        user_id=current_user.id,
    )
    return org


@router.get("/{org_id}", response_model=OrganisationDetailResponse)
async def get_organisation(
    org_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    svc = OrganisationService(db)
    return await svc.get_organisation(org_id)


@router.patch(
    "/{org_id}",
    response_model=OrganisationDetailResponse,
    dependencies=[Depends(require_permission("org", "update"))],
)
async def update_organisation(
    org_id: uuid.UUID,
    body: UpdateOrganisationRequest,
    current_user: CurrentUser,
    db: DBSession,
):
    svc = OrganisationService(db)
    org = await svc.update_organisation(
        org_id, updates=body.model_dump(exclude_none=True)
    )
    audit = AuditService(db)
    await audit.log(
        action="org.updated",
        resource_type="organisation",
        resource_id=str(org_id),
        organisation_id=org_id,
        user_id=current_user.id,
    )
    return org


@router.delete(
    "/{org_id}",
    status_code=204,
    dependencies=[Depends(require_permission("org", "delete"))],
)
async def delete_organisation(
    org_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    svc = OrganisationService(db)
    await svc.soft_delete_organisation(org_id)
    audit = AuditService(db)
    await audit.log(
        action="org.deleted",
        resource_type="organisation",
        resource_id=str(org_id),
        organisation_id=org_id,
        user_id=current_user.id,
    )


@router.get(
    "/{org_id}/dashboard-summary",
    dependencies=[Depends(require_permission("org", "read"))],
)
async def get_dashboard_summary(
    org_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    """
    Authoritative server-calculated dashboard summary across sales, purchases,
    smart document capture, and cash balance. No mock data.
    """
    from decimal import Decimal
    from sqlalchemy import func, select
    from app.bills.service import BillService
    from app.database.models import (
        BankAccount,
        CapturedDocument,
        DocumentProcessingStatus,
        Organisation,
    )
    from app.invoices.service import InvoiceService

    # 1. Organisation base currency
    org_res = await db.execute(select(Organisation).where(Organisation.id == org_id))
    org = org_res.scalar_one_or_none()
    currency = org.currency if org and hasattr(org, "currency") and org.currency else "GBP"

    # 2. Sales Metrics
    sales_metrics = await InvoiceService.get_metrics(db, org_id)

    # 3. Purchases Metrics
    purchases_metrics = await BillService.get_purchases_metrics(db, org_id)

    # 4. Smart Documents Status Summary
    doc_query = (
        select(CapturedDocument.processing_status, func.count(CapturedDocument.id))
        .where(CapturedDocument.organisation_id == org_id)
        .group_by(CapturedDocument.processing_status)
    )
    doc_res = await db.execute(doc_query)
    doc_counts = dict(doc_res.all())

    needs_review = doc_counts.get(
        DocumentProcessingStatus.NEEDS_MANUAL_REVIEW, 0
    ) + doc_counts.get(DocumentProcessingStatus.DUPLICATE_FILE, 0)
    processing = (
        doc_counts.get(DocumentProcessingStatus.QUEUED, 0)
        + doc_counts.get(DocumentProcessingStatus.PROCESSING, 0)
        + doc_counts.get(DocumentProcessingStatus.EXTRACTING, 0)
        + doc_counts.get(DocumentProcessingStatus.VALIDATING, 0)
    )
    ready = doc_counts.get(DocumentProcessingStatus.READY_FOR_REVIEW, 0)

    # 5. Authoritative Cash Balance (sum of active bank accounts)
    cash_query = select(func.coalesce(func.sum(BankAccount.current_balance), Decimal("0.00"))).where(
        BankAccount.organisation_id == org_id,
        BankAccount.active == True,
    )
    cash_balance = (await db.execute(cash_query)).scalar() or Decimal("0.00")

    return {
        "currency": currency,
        "sales": {
            "draft_count": sales_metrics.draft_count,
            "draft_total": sales_metrics.draft_total,
            "awaiting_payment_count": sales_metrics.awaiting_payment_count,
            "awaiting_payment_total": sales_metrics.awaiting_payment_total,
            "overdue_count": sales_metrics.overdue_count,
            "overdue_total": sales_metrics.overdue_total,
            "paid_count": sales_metrics.paid_count,
            "paid_total": sales_metrics.paid_total,
        },
        "purchases": {
            "draft_count": purchases_metrics.draft_count,
            "draft_total": purchases_metrics.draft_total,
            "awaiting_approval_count": purchases_metrics.awaiting_approval_count,
            "awaiting_approval_total": purchases_metrics.awaiting_approval_total,
            "awaiting_payment_count": purchases_metrics.awaiting_payment_count,
            "awaiting_payment_total": purchases_metrics.awaiting_payment_total,
            "overdue_count": purchases_metrics.overdue_count,
            "overdue_total": purchases_metrics.overdue_total,
            "paid_count": purchases_metrics.paid_count,
            "paid_total": purchases_metrics.paid_total,
        },
        "documents": {
            "needs_review": needs_review,
            "processing": processing,
            "ready_for_bill": ready,
        },
        "cash": {
            "balance": f"{Decimal(str(cash_balance)):.2f}",
        },
    }

