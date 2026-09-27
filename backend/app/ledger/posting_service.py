"""
Warp Ladger — Central Accounting Posting Engine
Enforces double-entry rules, period locks, idempotency, and audit trails
for all subledger transactions:
- Invoices: Dr AR, Cr Revenue, Cr VAT Output
- Bills: Dr Expense, Dr VAT Input, Cr AP
- Customer Payments: Dr Bank, Cr AR
- Supplier Payments: Dr AP, Cr Bank
- Reversals: Immutable reverse journal generation
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit.service import AuditService
from app.core.exceptions import (
    NotFoundError,
    ValidationFailedError,
    WarpLadgerError,
)
from app.database.models import (
    Account,
    AccountClass,
    Bill,
    BillStatus,
    Invoice,
    InvoiceStatus,
    JournalEntry,
    JournalEntryStatus,
    JournalLine,
    JournalSourceType,
    Payment,
    PaymentStatus,
    PaymentType,
)
from app.ledger.schemas import JournalReverseRequest
from app.ledger.service import (
    COAService,
    JournalSequenceService,
    JournalService,
    PeriodLockService,
)

log = structlog.get_logger(__name__)
UTC = timezone.utc
FOUR_PLACES = Decimal("0.0001")


class AccountingPostingService:
    """Central engine connecting subledgers (invoices, bills, payments) to the general ledger."""

    @staticmethod
    async def _resolve_account_by_code(
        db: AsyncSession,
        org_id: uuid.UUID,
        code: str,
        fallback_class: Optional[AccountClass] = None,
    ) -> Account:
        """Find an account by code for an organisation, or fallback by account class."""
        stmt = select(Account).where(
            Account.organisation_id == org_id,
            Account.code == code,
            Account.active == True,
        )
        res = await db.execute(stmt)
        account = res.scalars().first()
        if account:
            return account

        # Fallback to any active account of matching class
        if fallback_class:
            fb_stmt = select(Account).where(
                Account.organisation_id == org_id,
                Account.account_class == fallback_class,
                Account.active == True,
            ).order_by(Account.code.asc()).limit(1)
            fb_res = await db.execute(fb_stmt)
            account = fb_res.scalars().first()
            if account:
                return account

        raise NotFoundError(f"Required account with code '{code}' not configured in chart of accounts.")

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 1. SALES INVOICE POSTING & REVERSAL
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @staticmethod
    async def post_invoice_to_ledger(
        db: AsyncSession,
        invoice: Invoice,
        user_id: uuid.UUID,
    ) -> Optional[JournalEntry]:
        """
        Idempotent general ledger posting rule for sales invoices:
        Dr Accounts Receivable (Total)
        Cr Sales Revenue (Net = Subtotal - Discount)
        Cr VAT Output Tax (Tax Total)
        """
        org_id = invoice.organisation_id

        # 1. Idempotency Check: Do not post if already posted
        existing_stmt = select(JournalEntry).where(
            JournalEntry.organisation_id == org_id,
            JournalEntry.source_type == JournalSourceType.INVOICE,
            JournalEntry.source_id == invoice.id,
            JournalEntry.status == JournalEntryStatus.POSTED,
        )
        existing_res = await db.execute(existing_stmt)
        if existing_res.scalars().first():
            log.info("invoice_already_posted_to_ledger", invoice_id=str(invoice.id))
            return None

        # 2. Check Financial Period Lock
        inv_date = invoice.issue_date
        if isinstance(inv_date, datetime):
            inv_date = inv_date.date()
        await PeriodLockService.check_date_locked(db, org_id, inv_date)

        # 3. Ensure Default Chart of Accounts is Available
        await COAService.ensure_default_accounts(db, org_id)

        # 4. Resolve Accounts
        ar_account = await AccountingPostingService._resolve_account_by_code(
            db, org_id, "1200", AccountClass.ASSET
        )
        revenue_account = await AccountingPostingService._resolve_account_by_code(
            db, org_id, "4000", AccountClass.REVENUE
        )
        vat_output_account = await AccountingPostingService._resolve_account_by_code(
            db, org_id, "2200", AccountClass.LIABILITY
        )

        total_amount = Decimal(str(invoice.total or "0.00")).quantize(FOUR_PLACES)
        subtotal = Decimal(str(invoice.subtotal or "0.00")).quantize(FOUR_PLACES)
        discount = Decimal(str(invoice.discount_total or "0.00")).quantize(FOUR_PLACES)
        net_revenue = (subtotal - discount).quantize(FOUR_PLACES)
        tax_amount = Decimal(str(invoice.tax_total or "0.00")).quantize(FOUR_PLACES)

        # If zero-total invoice, nothing to post
        if total_amount <= Decimal("0.0000"):
            return None

        # Double-entry check
        if (net_revenue + tax_amount) != total_amount:
            # Adjust rounding difference on net revenue if penny discrepancy
            net_revenue = total_amount - tax_amount

        # 5. Generate Journal Number & Header
        entry_number = await JournalSequenceService.get_next_journal_number(db, org_id)
        now = datetime.now(UTC)

        journal = JournalEntry(
            organisation_id=org_id,
            entry_number=entry_number,
            entry_date=inv_date,
            status=JournalEntryStatus.POSTED,
            source_type=JournalSourceType.INVOICE,
            source_id=invoice.id,
            reference=invoice.invoice_number,
            narration=f"Sales Invoice {invoice.invoice_number} approved",
            total_debit=total_amount,
            total_credit=total_amount,
            posted_at=now,
            posted_by_id=user_id,
        )
        db.add(journal)
        await db.flush()

        line_num = 1
        # Line 1: Dr Accounts Receivable (Total)
        dr_line = JournalLine(
            journal_entry_id=journal.id,
            account_id=ar_account.id,
            line_number=line_num,
            description=f"AR - Invoice {invoice.invoice_number}",
            debit=total_amount,
            credit=Decimal("0.0000"),
            contact_id=invoice.customer_id,
        )
        db.add(dr_line)

        # Line 2: Cr Sales Revenue (Net)
        if net_revenue > Decimal("0.0000"):
            line_num += 1
            cr_rev_line = JournalLine(
                journal_entry_id=journal.id,
                account_id=revenue_account.id,
                line_number=line_num,
                description=f"Sales Revenue - Invoice {invoice.invoice_number}",
                debit=Decimal("0.0000"),
                credit=net_revenue,
                contact_id=invoice.customer_id,
            )
            db.add(cr_rev_line)

        # Line 3: Cr VAT Output (Tax)
        if tax_amount > Decimal("0.0000"):
            line_num += 1
            cr_vat_line = JournalLine(
                journal_entry_id=journal.id,
                account_id=vat_output_account.id,
                line_number=line_num,
                description=f"VAT Output Tax - Invoice {invoice.invoice_number}",
                debit=Decimal("0.0000"),
                credit=tax_amount,
                contact_id=invoice.customer_id,
            )
            db.add(cr_vat_line)

        await db.flush()

        await AuditService.log_static(
            db,
            action="ledger.invoice_posted",
            resource_type="journal_entry",
            resource_id=str(journal.id),
            organisation_id=org_id,
            user_id=user_id,
            diff={
                "entry_number": entry_number,
                "invoice_number": invoice.invoice_number,
                "total": str(total_amount),
            },
        )
        return journal

    @staticmethod
    async def reverse_invoice_journal(
        db: AsyncSession,
        invoice: Invoice,
        user_id: uuid.UUID,
        reason: str,
    ) -> Optional[JournalEntry]:
        """Create a counter-reversal journal when an invoice is voided."""
        org_id = invoice.organisation_id
        stmt = select(JournalEntry).where(
            JournalEntry.organisation_id == org_id,
            JournalEntry.source_type == JournalSourceType.INVOICE,
            JournalEntry.source_id == invoice.id,
            JournalEntry.status == JournalEntryStatus.POSTED,
        )
        res = await db.execute(stmt)
        orig_journal = res.scalars().first()
        if not orig_journal:
            return None

        return await JournalService.reverse_journal_entry(
            db=db,
            organisation_id=org_id,
            journal_id=orig_journal.id,
            data=JournalReverseRequest(reversal_reason=f"Void Invoice {invoice.invoice_number}: {reason}"),
            user_id=user_id,
        )

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 2. SUPPLIER BILL POSTING & REVERSAL
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @staticmethod
    async def post_bill_to_ledger(
        db: AsyncSession,
        bill: Bill,
        user_id: uuid.UUID,
    ) -> Optional[JournalEntry]:
        """
        Idempotent general ledger posting rule for supplier bills:
        Dr Expense / Cost of Sales (Net = Subtotal)
        Dr VAT Input Tax (Tax)
        Cr Accounts Payable (Total)
        """
        org_id = bill.organisation_id

        # 1. Idempotency Check
        existing_stmt = select(JournalEntry).where(
            JournalEntry.organisation_id == org_id,
            JournalEntry.source_type == JournalSourceType.BILL,
            JournalEntry.source_id == bill.id,
            JournalEntry.status == JournalEntryStatus.POSTED,
        )
        existing_res = await db.execute(existing_stmt)
        if existing_res.scalars().first():
            log.info("bill_already_posted_to_ledger", bill_id=str(bill.id))
            return None

        # 2. Check Financial Period Lock
        bill_date = bill.bill_date
        if isinstance(bill_date, datetime):
            bill_date = bill_date.date()
        await PeriodLockService.check_date_locked(db, org_id, bill_date)

        # 3. Ensure Default COA
        await COAService.ensure_default_accounts(db, org_id)

        # 4. Resolve Accounts
        ap_account = await AccountingPostingService._resolve_account_by_code(
            db, org_id, "2000", AccountClass.LIABILITY
        )
        default_expense_account = await AccountingPostingService._resolve_account_by_code(
            db, org_id, "5000", AccountClass.EXPENSE
        )
        vat_input_account = await AccountingPostingService._resolve_account_by_code(
            db, org_id, "2210", AccountClass.LIABILITY
        )

        total_amount = Decimal(str(bill.total or "0.00")).quantize(FOUR_PLACES)
        subtotal = Decimal(str(bill.subtotal or "0.00")).quantize(FOUR_PLACES)
        tax_amount = Decimal(str(bill.tax_total or "0.00")).quantize(FOUR_PLACES)

        if total_amount <= Decimal("0.0000"):
            return None

        if (subtotal + tax_amount) != total_amount:
            subtotal = total_amount - tax_amount

        # 5. Generate Sequential Journal Entry
        entry_number = await JournalSequenceService.get_next_journal_number(db, org_id)
        now = datetime.now(UTC)
        bill_ref = bill.internal_bill_number or bill.supplier_invoice_number or str(bill.id)

        journal = JournalEntry(
            organisation_id=org_id,
            entry_number=entry_number,
            entry_date=bill_date,
            status=JournalEntryStatus.POSTED,
            source_type=JournalSourceType.BILL,
            source_id=bill.id,
            reference=bill_ref,
            narration=f"Supplier Bill {bill_ref} approved",
            total_debit=total_amount,
            total_credit=total_amount,
            posted_at=now,
            posted_by_id=user_id,
        )
        db.add(journal)
        await db.flush()

        line_num = 1
        # Line 1: Dr Expense / Line Account
        if subtotal > Decimal("0.0000"):
            dr_exp_line = JournalLine(
                journal_entry_id=journal.id,
                account_id=default_expense_account.id,
                line_number=line_num,
                description=f"Expense - Bill {bill_ref}",
                debit=subtotal,
                credit=Decimal("0.0000"),
                contact_id=bill.supplier_id,
            )
            db.add(dr_exp_line)

        # Line 2: Dr VAT Input Tax
        if tax_amount > Decimal("0.0000"):
            line_num += 1
            dr_vat_line = JournalLine(
                journal_entry_id=journal.id,
                account_id=vat_input_account.id,
                line_number=line_num,
                description=f"VAT Input Tax - Bill {bill_ref}",
                debit=tax_amount,
                credit=Decimal("0.0000"),
                contact_id=bill.supplier_id,
            )
            db.add(dr_vat_line)

        # Line 3: Cr Accounts Payable (Total)
        line_num += 1
        cr_ap_line = JournalLine(
            journal_entry_id=journal.id,
            account_id=ap_account.id,
            line_number=line_num,
            description=f"AP - Bill {bill_ref}",
            debit=Decimal("0.0000"),
            credit=total_amount,
            contact_id=bill.supplier_id,
        )
        db.add(cr_ap_line)

        await db.flush()

        await AuditService.log_static(
            db,
            action="ledger.bill_posted",
            resource_type="journal_entry",
            resource_id=str(journal.id),
            organisation_id=org_id,
            user_id=user_id,
            diff={
                "entry_number": entry_number,
                "bill_number": bill_ref,
                "total": str(total_amount),
            },
        )
        return journal

    @staticmethod
    async def reverse_bill_journal(
        db: AsyncSession,
        bill: Bill,
        user_id: uuid.UUID,
        reason: str,
    ) -> Optional[JournalEntry]:
        """Create a counter-reversal journal when a bill is voided."""
        org_id = bill.organisation_id
        stmt = select(JournalEntry).where(
            JournalEntry.organisation_id == org_id,
            JournalEntry.source_type == JournalSourceType.BILL,
            JournalEntry.source_id == bill.id,
            JournalEntry.status == JournalEntryStatus.POSTED,
        )
        res = await db.execute(stmt)
        orig_journal = res.scalars().first()
        if not orig_journal:
            return None

        bill_ref = bill.internal_bill_number or bill.supplier_invoice_number or str(bill.id)
        return await JournalService.reverse_journal_entry(
            db=db,
            organisation_id=org_id,
            journal_id=orig_journal.id,
            data=JournalReverseRequest(reversal_reason=f"Void Bill {bill_ref}: {reason}"),
            user_id=user_id,
        )

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 3. PAYMENT POSTING & REVERSAL
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @staticmethod
    async def post_payment_to_ledger(
        db: AsyncSession,
        payment: Payment,
        user_id: uuid.UUID,
    ) -> Optional[JournalEntry]:
        """
        Idempotent general ledger posting rule for payments:
        - Customer Payment (INCOMING): Dr Bank Account, Cr Accounts Receivable
        - Supplier Payment (OUTGOING): Dr Accounts Payable, Cr Bank Account
        """
        org_id = payment.organisation_id

        # 1. Idempotency Check
        existing_stmt = select(JournalEntry).where(
            JournalEntry.organisation_id == org_id,
            JournalEntry.source_type == JournalSourceType.PAYMENT,
            JournalEntry.source_id == payment.id,
            JournalEntry.status == JournalEntryStatus.POSTED,
        )
        existing_res = await db.execute(existing_stmt)
        if existing_res.scalars().first():
            log.info("payment_already_posted_to_ledger", payment_id=str(payment.id))
            return None

        # 2. Check Financial Period Lock
        pay_date = payment.payment_date
        if isinstance(pay_date, datetime):
            pay_date = pay_date.date()
        await PeriodLockService.check_date_locked(db, org_id, pay_date)

        # 3. Ensure Default COA
        await COAService.ensure_default_accounts(db, org_id)

        # 4. Resolve Accounts
        bank_account = await AccountingPostingService._resolve_account_by_code(
            db, org_id, "1000", AccountClass.ASSET
        )
        amount = Decimal(str(payment.amount or "0.00")).quantize(FOUR_PLACES)
        if amount <= Decimal("0.0000"):
            return None

        entry_number = await JournalSequenceService.get_next_journal_number(db, org_id)
        now = datetime.now(UTC)

        journal = JournalEntry(
            organisation_id=org_id,
            entry_number=entry_number,
            entry_date=pay_date,
            status=JournalEntryStatus.POSTED,
            source_type=JournalSourceType.PAYMENT,
            source_id=payment.id,
            reference=payment.payment_number,
            narration=f"Payment {payment.payment_number} ({payment.payment_type.value})",
            total_debit=amount,
            total_credit=amount,
            posted_at=now,
            posted_by_id=user_id,
        )
        db.add(journal)
        await db.flush()

        if payment.payment_type == PaymentType.INCOMING:
            # Customer payment: Dr Bank, Cr AR
            ar_account = await AccountingPostingService._resolve_account_by_code(
                db, org_id, "1200", AccountClass.ASSET
            )
            line1 = JournalLine(
                journal_entry_id=journal.id,
                account_id=bank_account.id,
                line_number=1,
                description=f"Bank Receipt - {payment.payment_number}",
                debit=amount,
                credit=Decimal("0.0000"),
                contact_id=payment.contact_id,
            )
            line2 = JournalLine(
                journal_entry_id=journal.id,
                account_id=ar_account.id,
                line_number=2,
                description=f"AR Reduction - {payment.payment_number}",
                debit=Decimal("0.0000"),
                credit=amount,
                contact_id=payment.contact_id,
            )
            db.add_all([line1, line2])
        else:
            # Supplier payment: Dr AP, Cr Bank
            ap_account = await AccountingPostingService._resolve_account_by_code(
                db, org_id, "2000", AccountClass.LIABILITY
            )
            line1 = JournalLine(
                journal_entry_id=journal.id,
                account_id=ap_account.id,
                line_number=1,
                description=f"AP Settlement - {payment.payment_number}",
                debit=amount,
                credit=Decimal("0.0000"),
                contact_id=payment.contact_id,
            )
            line2 = JournalLine(
                journal_entry_id=journal.id,
                account_id=bank_account.id,
                line_number=2,
                description=f"Bank Disbursement - {payment.payment_number}",
                debit=Decimal("0.0000"),
                credit=amount,
                contact_id=payment.contact_id,
            )
            db.add_all([line1, line2])

        await db.flush()

        await AuditService.log_static(
            db,
            action="ledger.payment_posted",
            resource_type="journal_entry",
            resource_id=str(journal.id),
            organisation_id=org_id,
            user_id=user_id,
            diff={
                "entry_number": entry_number,
                "payment_number": payment.payment_number,
                "amount": str(amount),
            },
        )
        return journal

    @staticmethod
    async def reverse_payment_journal(
        db: AsyncSession,
        payment: Payment,
        user_id: uuid.UUID,
        reason: str,
    ) -> Optional[JournalEntry]:
        """Create a counter-reversal journal when a payment is voided."""
        org_id = payment.organisation_id
        stmt = select(JournalEntry).where(
            JournalEntry.organisation_id == org_id,
            JournalEntry.source_type == JournalSourceType.PAYMENT,
            JournalEntry.source_id == payment.id,
            JournalEntry.status == JournalEntryStatus.POSTED,
        )
        res = await db.execute(stmt)
        orig_journal = res.scalars().first()
        if not orig_journal:
            return None

        return await JournalService.reverse_journal_entry(
            db=db,
            organisation_id=org_id,
            journal_id=orig_journal.id,
            data=JournalReverseRequest(reversal_reason=f"Void Payment {payment.payment_number}: {reason}"),
            user_id=user_id,
        )
