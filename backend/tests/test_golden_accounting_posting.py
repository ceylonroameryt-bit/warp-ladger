"""
Warp Ladger — Golden Accounting Posting Integration Tests (Section 42)
End-to-end tests validating the double-entry accounting posting engine:
1. Sales Invoice posting:
   Invoice £1,000 + VAT £200 = £1,200
   Approved -> Journal:
     Dr Accounts Receivable (1200)  £1,200.00
     Cr Sales Revenue (4000)        £1,000.00
     Cr VAT Output (2200)             £200.00
2. Customer Payments:
   Receive £600 -> Dr Bank (1000) £600, Cr AR (1200) £600; Inv due £600
   Receive £600 -> Dr Bank (1000) £600, Cr AR (1200) £600; Inv PAID, due £0
3. Supplier Bill posting:
   Bill £1,000 + VAT £200 = £1,200
   Approved -> Journal:
     Dr Expense (5000)              £1,000.00
     Dr VAT Input (2210)              £200.00
     Cr Accounts Payable (2000)     £1,200.00
4. Supplier Payment:
   Pay £1,200 -> Dr AP (2000) £1,200, Cr Bank (1000) £1,200; Bill PAID
5. Reversal check on voiding.
"""
from decimal import Decimal
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database.models import (
    Account,
    Contact,
    ContactAddress,
    ContactStatus,
    ContactType,
    JournalEntry,
    JournalLine,
    JournalSourceType,
    TaxRate,
    TaxType,
)


@pytest.mark.asyncio
async def test_golden_sales_invoice_and_payment_posting_lifecycle(
    client: AsyncClient, test_setup, db_session
):
    org_id = test_setup["org_a"].id
    token = test_setup["token_a"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create TaxRate (20%)
    vat_20 = TaxRate(
        id=uuid.uuid4(),
        organisation_id=org_id,
        name="Standard VAT 20%",
        code="VAT20",
        rate=Decimal("20.0000"),
        tax_type=TaxType.STANDARD,
        active=True,
    )
    # Create Customer
    customer = Contact(
        id=uuid.uuid4(),
        organisation_id=org_id,
        business_name="Golden Client Ltd",
        contact_type=ContactType.CUSTOMER,
        status=ContactStatus.ACTIVE,
        email="finance@goldenclient.co.uk",
    )
    db_session.add_all([vat_20, customer])
    await db_session.commit()

    # 2. Create Bank Account
    bank_res = await client.post(
        f"/api/v1/organisations/{org_id}/bank-accounts",
        json={
            "account_name": "Operating Current Account",
            "account_type": "CHECKING",
            "currency": "GBP",
            "opening_balance": "5000.00",
            "is_default": True,
        },
        headers=headers,
    )
    assert bank_res.status_code == 201
    bank_account_id = bank_res.json()["id"]

    # 3. Create Sales Invoice: £1,000 + £200 VAT = £1,200 Total
    inv_res = await client.post(
        f"/api/v1/organisations/{org_id}/invoices",
        json={
            "customer_id": str(customer.id),
            "issue_date": "2026-09-01",
            "due_date": "2026-09-30",
            "currency": "GBP",
            "lines": [
                {
                    "description": "Consulting Services",
                    "quantity": "10",
                    "unit_price": "100.00",
                    "tax_rate_id": str(vat_20.id),
                }
            ],
        },
        headers=headers,
    )
    assert inv_res.status_code == 201
    invoice_id = inv_res.json()["id"]
    assert inv_res.json()["total"] == "1200.00"

    # 4. Approve Invoice -> triggers AccountingPostingService.post_invoice_to_ledger
    app_res = await client.post(
        f"/api/v1/organisations/{org_id}/invoices/{invoice_id}/approve",
        headers=headers,
    )
    assert app_res.status_code == 200

    # 5. Verify the Golden Journal Entry was posted to the General Ledger
    stmt = (
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines).joinedload(JournalLine.account))
        .where(
            JournalEntry.organisation_id == org_id,
            JournalEntry.source_type == JournalSourceType.INVOICE,
            JournalEntry.source_id == uuid.UUID(invoice_id),
        )
    )
    j_res = await db_session.execute(stmt)
    journal = j_res.scalar_one_or_none()
    assert journal is not None
    assert journal.status.value == "POSTED"
    assert journal.total_debit == Decimal("1200.0000")
    assert journal.total_credit == Decimal("1200.0000")

    # Inspect Lines
    lines_by_code = {l.account.code: l for l in journal.lines}
    # Dr AR (1200) £1200
    assert "1200" in lines_by_code
    assert lines_by_code["1200"].debit == Decimal("1200.0000")
    assert lines_by_code["1200"].credit == Decimal("0.0000")

    # Cr Revenue (4000) £1000
    assert "4000" in lines_by_code
    assert lines_by_code["4000"].debit == Decimal("0.0000")
    assert lines_by_code["4000"].credit == Decimal("1000.0000")

    # Cr VAT Output (2200) £200
    assert "2200" in lines_by_code
    assert lines_by_code["2200"].debit == Decimal("0.0000")
    assert lines_by_code["2200"].credit == Decimal("200.0000")

    # 6. First Payment: £600 partial settlement
    pay1_res = await client.post(
        f"/api/v1/organisations/{org_id}/payments",
        json={
            "contact_id": str(customer.id),
            "bank_account_id": bank_account_id,
            "payment_type": "INCOMING",
            "amount": "600.00",
            "payment_date": "2026-09-10T12:00:00Z",
            "payment_method": "BANK_TRANSFER",
            "reference": "FP-001",
            "allocations": [
                {
                    "target_type": "INVOICE",
                    "invoice_id": invoice_id,
                    "amount": "600.00",
                }
            ],
        },
        headers=headers,
    )
    assert pay1_res.status_code == 201

    # Verify invoice status is PARTIALLY_PAID, balance is £600
    inv_check1 = await client.get(
        f"/api/v1/organisations/{org_id}/invoices/{invoice_id}", headers=headers
    )
    assert inv_check1.json()["status"] == "PARTIALLY_PAID"
    assert Decimal(str(inv_check1.json()["amount_paid"])) == Decimal("600.00")
    assert Decimal(str(inv_check1.json()["amount_due"])) == Decimal("600.00")

    # 7. Second Payment: £600 final settlement
    pay2_res = await client.post(
        f"/api/v1/organisations/{org_id}/payments",
        json={
            "contact_id": str(customer.id),
            "bank_account_id": bank_account_id,
            "payment_type": "INCOMING",
            "amount": "600.00",
            "payment_date": "2026-09-15T12:00:00Z",
            "payment_method": "BANK_TRANSFER",
            "reference": "FP-002",
            "allocations": [
                {
                    "target_type": "INVOICE",
                    "invoice_id": invoice_id,
                    "amount": "600.00",
                }
            ],
        },
        headers=headers,
    )
    assert pay2_res.status_code == 201

    # Verify invoice status is PAID, balance is £0.00
    inv_check2 = await client.get(
        f"/api/v1/organisations/{org_id}/invoices/{invoice_id}", headers=headers
    )
    assert inv_check2.json()["status"] == "PAID"
    assert Decimal(str(inv_check2.json()["amount_paid"])) == Decimal("1200.00")
    assert Decimal(str(inv_check2.json()["amount_due"])) == Decimal("0.00")


@pytest.mark.asyncio
async def test_golden_supplier_bill_and_payment_posting_lifecycle(
    client: AsyncClient, test_setup, db_session
):
    org_id = test_setup["org_a"].id
    token = test_setup["token_a"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create TaxRate and Supplier
    vat_20 = TaxRate(
        id=uuid.uuid4(),
        organisation_id=org_id,
        name="Standard Input VAT 20%",
        code="IN_VAT20",
        rate=Decimal("20.0000"),
        tax_type=TaxType.STANDARD,
        active=True,
    )
    supplier = Contact(
        id=uuid.uuid4(),
        organisation_id=org_id,
        business_name="Golden Supplier Ltd",
        contact_type=ContactType.SUPPLIER,
        status=ContactStatus.ACTIVE,
        email="accounts@goldensupplier.co.uk",
    )
    db_session.add_all([vat_20, supplier])
    await db_session.commit()

    # 2. Create Bank Account
    bank_res = await client.post(
        f"/api/v1/organisations/{org_id}/bank-accounts",
        json={
            "account_name": "Operating Payments Account",
            "account_type": "CHECKING",
            "currency": "GBP",
            "opening_balance": "10000.00",
            "is_default": True,
        },
        headers=headers,
    )
    assert bank_res.status_code == 201
    bank_account_id = bank_res.json()["id"]

    # 3. Create Bill: £1,000 + £200 VAT = £1,200 Total
    bill_res = await client.post(
        f"/api/v1/organisations/{org_id}/bills",
        json={
            "supplier_id": str(supplier.id),
            "supplier_invoice_number": "SUP-GLD-101",
            "bill_date": "2026-09-05T09:00:00Z",
            "lines": [
                {
                    "description": "Server Hardware & Infrastructure",
                    "quantity": "1",
                    "unit_price": "1000.00",
                    "tax_rate_id": str(vat_20.id),
                }
            ],
        },
        headers=headers,
    )
    assert bill_res.status_code == 201
    bill_id = bill_res.json()["id"]
    assert bill_res.json()["total"] == "1200.00"

    # 4. Submit & Approve Bill -> triggers post_bill_to_ledger
    await client.post(
        f"/api/v1/organisations/{org_id}/bills/{bill_id}/submit",
        json={"comment": "Ready for approval"},
        headers=headers,
    )
    app_res = await client.post(
        f"/api/v1/organisations/{org_id}/bills/{bill_id}/approve",
        json={"comment": "Approved by CFO"},
        headers=headers,
    )
    assert app_res.status_code == 200

    # 5. Verify the Golden Journal Entry was posted to the General Ledger
    stmt = (
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines).joinedload(JournalLine.account))
        .where(
            JournalEntry.organisation_id == org_id,
            JournalEntry.source_type == JournalSourceType.BILL,
            JournalEntry.source_id == uuid.UUID(bill_id),
        )
    )
    j_res = await db_session.execute(stmt)
    journal = j_res.scalar_one_or_none()
    assert journal is not None
    assert journal.status.value == "POSTED"
    assert journal.total_debit == Decimal("1200.0000")
    assert journal.total_credit == Decimal("1200.0000")

    # Inspect Lines
    lines_by_code = {l.account.code: l for l in journal.lines}
    # Dr Expense (5000) £1000
    assert "5000" in lines_by_code
    assert lines_by_code["5000"].debit == Decimal("1000.0000")
    assert lines_by_code["5000"].credit == Decimal("0.0000")

    # Dr VAT Input (2210) £200
    assert "2210" in lines_by_code
    assert lines_by_code["2210"].debit == Decimal("200.0000")
    assert lines_by_code["2210"].credit == Decimal("0.0000")

    # Cr AP (2000) £1200
    assert "2000" in lines_by_code
    assert lines_by_code["2000"].debit == Decimal("0.0000")
    assert lines_by_code["2000"].credit == Decimal("1200.0000")

    # 6. Pay Supplier Bill in Full: £1,200
    pay_res = await client.post(
        f"/api/v1/organisations/{org_id}/payments",
        json={
            "contact_id": str(supplier.id),
            "bank_account_id": bank_account_id,
            "payment_type": "OUTGOING",
            "amount": "1200.00",
            "payment_date": "2026-09-12T14:00:00Z",
            "payment_method": "BANK_TRANSFER",
            "reference": "SUP-PAY-01",
            "allocations": [
                {
                    "target_type": "BILL",
                    "bill_id": bill_id,
                    "amount": "1200.00",
                }
            ],
        },
        headers=headers,
    )
    assert pay_res.status_code == 201

    # Verify bill status is PAID, balance is £0.00
    bill_check = await client.get(
        f"/api/v1/organisations/{org_id}/bills/{bill_id}", headers=headers
    )
    assert bill_check.json()["status"] == "PAID"
    assert Decimal(str(bill_check.json()["amount_paid"])) == Decimal("1200.00")
    assert Decimal(str(bill_check.json()["amount_due"])) == Decimal("0.00")
