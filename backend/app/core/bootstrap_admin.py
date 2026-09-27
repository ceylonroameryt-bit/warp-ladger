"""
Warp Ladger — Secure Superadmin Bootstrap Tool (Section 20)
Provides an explicit, auditable CLI command to bootstrap or promote a superadmin.
Never grants superadmin implicitly to random first-registered public users.

Usage:
    python -m app.core.bootstrap_admin --email admin@example.com --password SecretPassword123! --name "Platform Superadmin"
"""
import argparse
import asyncio
import sys
import uuid

from sqlalchemy import select

from app.core.database import async_session_factory
from app.core.security import hash_password
from app.database.models import AuthProvider, AuthProviderType, User


async def bootstrap_superadmin(email: str, password: str, full_name: str) -> None:
    clean_email = email.lower().strip()
    async with async_session_factory() as session:
        # Check if user already exists
        res = await session.execute(select(User).where(User.email == clean_email))
        user = res.scalar_one_or_none()

        if user:
            print(f"[!] User '{clean_email}' already exists. Promoting to superadmin...")
            user.is_superadmin = True
            user.email_verified = True
            if password:
                user.hashed_password = hash_password(password)
            if full_name:
                user.full_name = full_name
            await session.commit()
            print(f"[✓] Successfully promoted existing user '{clean_email}' to superadmin.")
            return

        # Create new superadmin
        new_user = User(
            id=uuid.uuid4(),
            email=clean_email,
            hashed_password=hash_password(password),
            full_name=full_name,
            is_superadmin=True,
            email_verified=True,
            active=True,
        )
        session.add(new_user)

        auth_provider = AuthProvider(user=new_user, provider=AuthProviderType.local)
        session.add(auth_provider)

        await session.commit()
        print(f"[✓] Successfully bootstrapped superadmin user '{clean_email}'.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap or promote a Warp Ladger superadmin")
    parser.add_argument("--email", required=True, help="Superadmin email address")
    parser.add_argument("--password", required=True, help="Superadmin password (min 8 chars)")
    parser.add_argument("--name", default="Platform Superadmin", help="Full name of superadmin")

    args = parser.parse_args()
    if len(args.password) < 8:
        print("[X] Password must be at least 8 characters long.", file=sys.stderr)
        sys.exit(1)

    asyncio.run(bootstrap_superadmin(args.email, args.password, args.name))


if __name__ == "__main__":
    main()
