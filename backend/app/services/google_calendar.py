"""A small Google Calendar client: OAuth, reading events, writing events.

Scopes: the user's email (to show which account is connected) and
calendar.events (read and write events). Nothing else in their Google account.
"""

import logging
from datetime import datetime
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"
SCOPES = f"openid email {CALENDAR_SCOPE}"


class CalendarError(Exception):
    """Google said no, or couldn't be reached."""


class CalendarRevoked(CalendarError):
    """The user removed Nomi's access in their Google account."""


class CalendarScopeMissing(CalendarError):
    """They signed in but unticked "See and edit events" on Google's consent screen."""


class GoogleCalendar:
    def __init__(self, client_id: str, client_secret: str, http: httpx.Client | None = None) -> None:
        self._id = client_id
        self._secret = client_secret
        self._http = http or httpx.Client(timeout=10)

    # ---------- OAuth ----------

    def auth_url(self, redirect_uri: str, state: str) -> str:
        return AUTH_URL + "?" + urlencode({
            "client_id": self._id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": SCOPES,
            "access_type": "offline",  # a refresh token, so sync works later
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        })

    def exchange(self, code: str, redirect_uri: str) -> tuple[str, str, str | None]:
        """Returns (refresh_token, access_token, email)."""
        data = self._token({
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        refresh = data.get("refresh_token")
        # Google lets people untick individual permissions; without calendar
        # access every later call would fail, so say so now.
        if "scope" in data and CALENDAR_SCOPE not in data["scope"].split():
            raise CalendarScopeMissing("Calendar access wasn't granted.")
        if not refresh:
            raise CalendarError("Google didn't return a refresh token.")
        email = None
        try:
            info = self._request("GET", USERINFO_URL, data["access_token"])
            email = info.get("email")
        except CalendarError:
            pass  # the email is a nicety
        return refresh, data["access_token"], email

    def access_token(self, refresh_token: str) -> str:
        return self._token({"refresh_token": refresh_token, "grant_type": "refresh_token"})["access_token"]

    def revoke(self, token: str) -> None:
        try:
            self._http.post(REVOKE_URL, params={"token": token})
        except httpx.HTTPError:
            logger.warning("Couldn't reach Google to revoke a calendar token")

    def _token(self, form: dict) -> dict:
        try:
            response = self._http.post(TOKEN_URL, data={**form, "client_id": self._id, "client_secret": self._secret})
        except httpx.HTTPError as exc:
            raise CalendarError("Couldn't reach Google.") from exc
        if response.status_code == 400 and "invalid_grant" in response.text:
            raise CalendarRevoked("Google Calendar access was removed.")
        if response.status_code >= 400:
            logger.warning("Google token request failed: %s %s", response.status_code, response.text[:300])
            raise CalendarError("Google didn't accept the calendar sign-in.")
        return response.json()

    # ---------- Events ----------

    def list_events(self, access_token: str, time_min: datetime, time_max: datetime, limit: int = 25) -> list[dict]:
        data = self._request("GET", EVENTS_URL, access_token, params={
            "timeMin": time_min.isoformat(),
            "timeMax": time_max.isoformat(),
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": str(limit),
        })
        return data.get("items", [])

    def insert_event(self, access_token: str, body: dict) -> str:
        return self._request("POST", EVENTS_URL, access_token, json=body)["id"]

    def patch_event(self, access_token: str, event_id: str, body: dict) -> None:
        self._request("PATCH", f"{EVENTS_URL}/{event_id}", access_token, json=body)

    def delete_event(self, access_token: str, event_id: str) -> None:
        try:
            self._request("DELETE", f"{EVENTS_URL}/{event_id}", access_token)
        except CalendarError:
            pass  # already gone is fine

    def _request(self, method: str, url: str, access_token: str, **kwargs) -> dict:
        try:
            response = self._http.request(method, url, headers={"Authorization": f"Bearer {access_token}"}, **kwargs)
        except httpx.HTTPError as exc:
            raise CalendarError("Couldn't reach Google Calendar.") from exc
        if response.status_code >= 400:
            # Google's message names the fix (e.g. "Calendar API has not been used in project ...").
            logger.warning("Google Calendar %s failed: %s %s", method, response.status_code, response.text[:300])
            raise CalendarError(f"Google Calendar returned {response.status_code}.")
        return response.json() if response.content else {}
