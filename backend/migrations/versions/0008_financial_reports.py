"""0008_financial_reports

Revision ID: 0008_financial_reports
Revises: 0007_accounting_ledger
Create Date: 2026-09-27 10:50:00.000000

Phase 8: Financial Reporting indexes and ledger reporting optimizations.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0008_financial_reports'
down_revision: Union[str, None] = '0007_accounting_ledger'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Composite indexes for high-performance financial reporting aggregation
    op.create_index(
        'ix_journal_entries_report_range',
        'journal_entries',
        ['organisation_id', 'status', 'entry_date']
    )
    op.create_index(
        'ix_journal_lines_acc_entry',
        'journal_lines',
        ['account_id', 'journal_entry_id']
    )


def downgrade() -> None:
    op.drop_index('ix_journal_lines_acc_entry', table_name='journal_lines')
    op.drop_index('ix_journal_entries_report_range', table_name='journal_entries')
