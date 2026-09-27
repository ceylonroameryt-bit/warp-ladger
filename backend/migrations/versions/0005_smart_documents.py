"""Phase 5 — Smart Document Capture: Captured Documents, Extractions, Fields, Lines, Jobs

Revision ID: 0005_smart_documents
Revises: 0004_phase4_bills
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0005_smart_documents'
down_revision = '0004_phase4_bills'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── captured_documents ────────────────────────────────────────────────
    op.create_table(
        'captured_documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('file_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('files.id', ondelete='CASCADE'), nullable=False),
        sa.Column('original_filename', sa.String(255), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=False),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('checksum_sha256', sa.String(64), nullable=False),
        sa.Column('page_count', sa.Integer(), nullable=True),
        sa.Column('processing_status', sa.String(50), nullable=False, server_default='QUEUED'),
        sa.Column('document_type', sa.String(50), nullable=True),
        sa.Column('assigned_to_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_bill_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bills.id', ondelete='SET NULL'), nullable=True),
        sa.Column('current_extraction_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('source', sa.String(50), nullable=False, server_default='WEB_UPLOAD'),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index('ix_captured_docs_org_status', 'captured_documents', ['organisation_id', 'processing_status'])
    op.create_index('ix_captured_docs_checksum', 'captured_documents', ['organisation_id', 'checksum_sha256'])

    # ── document_extractions ──────────────────────────────────────────────
    op.create_table(
        'document_extractions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('captured_documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('raw_payload', postgresql.JSONB(), nullable=True),
        sa.Column('supplier_name_raw', sa.String(255), nullable=True),
        sa.Column('supplier_name_normalized', sa.String(255), nullable=True),
        sa.Column('supplier_vat_number', sa.String(50), nullable=True),
        sa.Column('invoice_number', sa.String(100), nullable=True),
        sa.Column('invoice_date', sa.Date(), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('currency', sa.String(3), nullable=False, server_default='GBP'),
        sa.Column('subtotal', sa.Numeric(18, 4), nullable=True),
        sa.Column('tax_total', sa.Numeric(18, 4), nullable=True),
        sa.Column('total', sa.Numeric(18, 4), nullable=True),
        sa.Column('suggested_expense_account_code', sa.String(20), nullable=True),
        sa.Column('overall_confidence', sa.Numeric(5, 4), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # ── document_extraction_fields ────────────────────────────────────────
    op.create_table(
        'document_extraction_fields',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('extraction_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('document_extractions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('field_name', sa.String(100), nullable=False),
        sa.Column('extracted_value', sa.Text(), nullable=True),
        sa.Column('confidence', sa.Numeric(5, 4), nullable=True),
        sa.Column('bounding_box', postgresql.JSONB(), nullable=True),
        sa.Column('is_corrected', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('corrected_value', sa.Text(), nullable=True),
    )

    # ── document_extraction_lines ─────────────────────────────────────────
    op.create_table(
        'document_extraction_lines',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('extraction_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('document_extractions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('quantity', sa.Numeric(18, 4), nullable=True),
        sa.Column('unit_price', sa.Numeric(18, 4), nullable=True),
        sa.Column('tax_rate', sa.Numeric(8, 4), nullable=True),
        sa.Column('tax_amount', sa.Numeric(18, 4), nullable=True),
        sa.Column('line_total', sa.Numeric(18, 4), nullable=True),
        sa.Column('confidence', sa.Numeric(5, 4), nullable=True),
    )

    # ── document_processing_jobs ──────────────────────────────────────────
    op.create_table(
        'document_processing_jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('captured_documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='QUEUED'),
        sa.Column('job_type', sa.String(50), nullable=False, server_default='EXTRACTION'),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table('document_processing_jobs')
    op.drop_table('document_extraction_lines')
    op.drop_table('document_extraction_fields')
    op.drop_table('document_extractions')
    op.drop_table('captured_documents')
