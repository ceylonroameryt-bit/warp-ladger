"""0006_payments

Revision ID: 0006_payments
Revises: 0005_smart_documents
Create Date: 2026-09-27 10:45:00.000000

Phase 6: Bank accounts, payment sequences, payments, and payment allocations.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0006_payments'
down_revision: Union[str, None] = '0005_smart_documents'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Bank Accounts ──────────────────────────────────────────
    op.create_table(
        'bank_accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('account_name', sa.String(100), nullable=False),
        sa.Column(
            'account_type',
            sa.Enum('CHECKING', 'SAVINGS', 'CREDIT_CARD', name='bankaccounttype'),
            nullable=False,
            server_default='CHECKING'
        ),
        sa.Column('currency', sa.String(3), nullable=False, server_default='GBP'),
        sa.Column('account_number', sa.String(50), nullable=True),
        sa.Column('sort_code', sa.String(20), nullable=True),
        sa.Column('iban', sa.String(50), nullable=True),
        sa.Column('bic_swift', sa.String(20), nullable=True),
        sa.Column('opening_balance', sa.Numeric(19, 4), nullable=False, server_default='0'),
        sa.Column('current_balance', sa.Numeric(19, 4), nullable=False, server_default='0'),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.UniqueConstraint('organisation_id', 'account_name', name='uq_bank_account_org_name')
    )
    op.create_index('ix_bank_accounts_org_id', 'bank_accounts', ['organisation_id'])

    # ── Payment Sequences ──────────────────────────────────────
    op.create_table(
        'organisation_payment_sequences',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column(
            'payment_type',
            sa.Enum('INCOMING', 'OUTGOING', name='paymenttype'),
            nullable=False
        ),
        sa.Column('next_number', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('prefix', sa.String(10), nullable=False, server_default='PAY-'),
        sa.UniqueConstraint('organisation_id', 'payment_type', name='uq_org_payment_sequence')
    )

    # ── Payments ───────────────────────────────────────────────
    op.create_table(
        'payments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('payment_number', sa.String(50), nullable=False),
        sa.Column(
            'payment_type',
            sa.Enum('INCOMING', 'OUTGOING', name='paymenttype', create_type=False),
            nullable=False
        ),
        sa.Column(
            'status',
            sa.Enum('DRAFT', 'POSTED', 'VOIDED', 'REFUNDED', name='paymentstatus'),
            nullable=False,
            server_default='POSTED'
        ),
        sa.Column('contact_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('contacts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('bank_account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bank_accounts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('payment_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('amount', sa.Numeric(19, 4), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, server_default='GBP'),
        sa.Column(
            'payment_method',
            sa.Enum('BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'DIRECT_DEBIT', 'CHECK', 'CASH', 'OTHER', name='paymentmethod'),
            nullable=False,
            server_default='BANK_TRANSFER'
        ),
        sa.Column('reference', sa.String(100), nullable=True),
        sa.Column('allocated_amount', sa.Numeric(19, 4), nullable=False, server_default='0'),
        sa.Column('unallocated_amount', sa.Numeric(19, 4), nullable=False, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('voided_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('voided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('void_reason', sa.Text(), nullable=True),
        sa.UniqueConstraint('organisation_id', 'payment_number', name='uq_payments_org_number')
    )
    op.create_index('ix_payments_org_date', 'payments', ['organisation_id', 'payment_date'])
    op.create_index('ix_payments_contact', 'payments', ['contact_id'])
    op.create_index('ix_payments_number', 'payments', ['organisation_id', 'payment_number'])

    # ── Payment Allocations ────────────────────────────────────
    op.create_table(
        'payment_allocations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('payment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('payments.id', ondelete='CASCADE'), nullable=False),
        sa.Column(
            'target_type',
            sa.Enum('INVOICE', 'BILL', name='allocationtargettype'),
            nullable=False
        ),
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=True),
        sa.Column('bill_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bills.id', ondelete='CASCADE'), nullable=True),
        sa.Column('amount', sa.Numeric(19, 4), nullable=False),
        sa.Column('allocated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('allocated_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True)
    )
    op.create_index('ix_payment_allocations_payment', 'payment_allocations', ['payment_id'])
    op.create_index('ix_payment_allocations_invoice', 'payment_allocations', ['invoice_id'])
    op.create_index('ix_payment_allocations_bill', 'payment_allocations', ['bill_id'])
    op.create_index('ix_payment_allocations_org', 'payment_allocations', ['organisation_id'])


def downgrade() -> None:
    op.drop_table('payment_allocations')
    op.drop_table('payments')
    op.drop_table('organisation_payment_sequences')
    op.drop_table('bank_accounts')

    op.execute('DROP TYPE IF EXISTS allocationtargettype')
    op.execute('DROP TYPE IF EXISTS paymentmethod')
    op.execute('DROP TYPE IF EXISTS paymentstatus')
    op.execute('DROP TYPE IF EXISTS paymenttype')
    op.execute('DROP TYPE IF EXISTS bankaccounttype')
