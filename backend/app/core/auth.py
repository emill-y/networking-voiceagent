"""Who is making this request?

Today every request acts as a single development user (DEV_USER_ID), which
is fine on your own machine and nowhere else. When Supabase Auth is wired
in, this function will verify the `Authorization: Bearer <jwt>` header and
return the token's user id. Every route already depends on it, so that
change happens in exactly one place.
"""

from uuid import UUID

from app.core.config import get_settings


def get_current_user_id() -> UUID:
    return UUID(get_settings().dev_user_id)
