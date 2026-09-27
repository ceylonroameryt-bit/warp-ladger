"""0007_accounting_ledger

Revision ID: 0007_accounting_ledger
Revises: 0006_payments
Create Date: 2026-09-27 10:48:00.000000

Phase 7: Chart of Accounts, Journal Sequences, Journal Entries, Journal Lines, Financial Periods, and Accounting Settings.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0007_accounting_ledger'
down_revision: Union[str, None] = '0006_payments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Chart of Accounts ──────────────────────────────────────
    op.create_table(
        'accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code', sa.String(20), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column(
            'account_class',
            sa.Enum('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', name='accountclass'),
            nullable=False
        ),
        sa.Column('account_subtype', sa.String(50), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, server_default='GBP'),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('description', sa.Text(), nullable=True),
        sa.UniqueConstraint('organisation_id', 'code', name='uq_account_org_code')
    )
    op.create_index('ix_accounts_org_class', 'accounts', ['organisation_id', 'account_class'])
    op.create_index('ix_accounts_org_active', 'accounts', ['organisation_id', 'active'])

    # ── Organisation Journal Sequences ─────────────────────────
    op.create_table(
        'organisation_journal_sequences',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('prefix', sa.String(20), nullable=False, server_default='JRN-'),
        sa.Column('next_number', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('padding', sa.Integer(), nullable=False, server_default='6'),
        sa.UniqueConstraint('organisation_id', 'prefix', name='uq_journal_seq_org_prefix')
    )

    # ── Journal Entries ────────────────────────────────────────
    op.create_table(
        'journal_entries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('entry_number', sa.String(50), nullable=False),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('DRAFT', 'POSTED', 'VOIDED', 'REVERSED', name='journalentrystatus'),
            nullable=False,
            server_default='DRAFT'
        ),
        sa.Column(
            'source_type',
            sa.Enum('MANUAL', 'INVOICE', 'BILL', 'PAYMENT', 'PAYROLL', 'REVERSAL', 'YEAR_END', 'OPENING_BALANCE', name='journalsourcetype'),
            nullable=False,
            server_default='MANUAL'
        ),
        sa.Column('source_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('reference', sa.String(100), nullable=True),
        sa.Column('narration', sa.Text(), nullable=True),
        sa.Column('total_debit', sa.Numeric(19, 4), nullable=False, server_default='0'),
        sa.Column('total_credit', sa.Numeric(19, 4), nullable=False, server_default='0'),
        sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('posted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reversed_entry_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('journal_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reversal_reason', sa.Text(), nullable=True),
        sa.UniqueConstraint('organisation_id', 'entry_number', name='uq_journal_entry_org_number')
    )
    op.create_index('ix_journal_entries_org_status', 'journal_entries', ['organisation_id', 'status'])
    op.create_index('ix_journal_entries_org_date', 'journal_entries', ['organisation_id', 'entry_date'])
    op.create_index('ix_journal_entries_org_source', 'journal_entries', ['organisation_id', 'source_type', 'source_id'])

    # ── Journal Lines ──────────────────────────────────────────
    op.create_table(
        'journal_lines',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('journal_entry_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('journal_entries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('accounts.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('line_number', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('debit', sa.Numeric(19, 4), nullable=False, server_default='0'),
        sa.Column('credit', sa.Numeric(19, 4), nullable=False, server_default='0'),
        sa.Column('contact_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('contacts.id', ondelete='SET NULL'), nullable=True)
    )
    op.create_index('ix_journal_lines_entry', 'journal_lines', ['journal_entry_id'])
    op.create_index('ix_journal_lines_account', 'journal_lines', ['account_id'])
    op.create_index('ix_journal_lines_contact', 'journal_lines', ['contact_id'])

    # ── Financial Periods ──────────────────────────────────────
    op.create_table(
        'financial_periods',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period_name', sa.String(100), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_locked', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('locked_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('lock_reason', sa.Text(), nullable=True),
        sa.UniqueConstraint('organisation_id', 'period_name', name='uq_financial_period_org_name')
    )
    op.create_index('ix_financial_periods_dates', 'financial_periods', ['organisation_id', 'start_date', 'end_date'])

    # ── Organisation Accounting Settings ───────────────────────
    op.create_table(
        'organisation_accounting_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('financial_year_end_day', sa.Integer(), nullable=False, server_default='31'),
        sa.Column('financial_year_end_month', sa.Integer(), nullable=False, server_default='12'),
        sa.Column('lock_date', sa.Date(), nullable=True),
        sa.UniqueConstraint('organisation_id', name='uq_accounting_settings_org')
    )


def downgrade() -> None:
    op.drop_table('organisation_accounting_settings')
    op.drop_table('financial_periods')
    op.drop_table('journal_lines')
    op.drop_table('journal_entries')
    op.drop_table('organisation_journal_sequences')
    op.drop_table('accounts')

    op.execute('DROP TYPE IF EXISTS journalsourcetype')
    op.execute('DROP TYPE IF EXISTS journalentrystatus')
    op.execute('DROP TYPE IF EXISTS accountclass')
