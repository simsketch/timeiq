# Outlook calendar setup

Outlook uses read-only delegated Microsoft Graph access to the connected account's default calendar, matching Google Calendar's read-only integration. Bookings do not write events to either provider. The scopes are `offline_access Calendars.Read User.Read`; TimeIQ uses `User.Read` to identify the connected account and avoid duplicates when reconnecting.

The connect button and OAuth endpoints are disabled unless both `MS_CLIENT_ID` and `MS_CLIENT_SECRET` are set. Existing Microsoft sources also skip background sync while disabled. No frontend environment variable is required.

## Register the Entra application

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/), then open **Identity → Applications → App registrations → New registration**. Name the app **TimeIQ**.
2. Under **Supported account types**, select **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts**.
3. Under **Redirect URI**, choose the **Web** platform and enter `https://api.timeiq.app/api/microsoft/callback` for the hosted backend. For another deployment, use the exact value of `BACKEND_URL` followed by `/api/microsoft/callback`. Register the app. Copy its **Application (client) ID** into the backend's `MS_CLIENT_ID`.
4. In **Authentication → Add a platform → Web**, add `http://localhost:8000/api/microsoft/callback` if local testing is needed. Leave implicit access-token and ID-token grants off; the server uses authorization code flow with PKCE and a client secret.
5. In **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, add `Calendars.Read`, `User.Read`, and `offline_access`. Keep the requested permissions read-only. If an organization's consent policy requires it, its administrator must grant consent for these delegated permissions.
6. In **Certificates & secrets → Client secrets → New client secret**, enter a description and choose an expiration. Copy the secret **Value** into backend `MS_CLIENT_SECRET` before leaving the page. Schedule rotation before its expiration.
7. Set backend `MS_TENANT=common` (the default) to accept both organizational and personal accounts. Set `BACKEND_URL=https://api.timeiq.app` and `FRONTEND_URL=https://timeiq.app`, or the matching URLs for your deployment.
8. Merge the lane supplying migration `023_oauth`, then apply migration `024_outlook` through the owner's normal deployment process. Deploy the backend and frontend. In **Calendars**, choose **Connect Outlook**, consent, and confirm the source reports a successful sync. Verify that a busy event blocks booking availability and a free event does not. Remove the source to disconnect it from TimeIQ; the user can also revoke the app's consent in Microsoft account settings.

Microsoft's references: [app registration and client secrets](https://learn.microsoft.com/en-us/graph/auth-register-app-v2), [authorization code flow and PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), and [calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0).

## Storage and sync

Migration `024_outlook` (parent `023_oauth`) adds nullable Microsoft access-token, refresh-token, expiry, and account-id columns to `timeiq.calendar_sources`. Tokens use the same direct database storage as the existing Google integration; application-level token encryption is not currently implemented for either provider. Tokens are excluded from calendar API responses and are never returned to the frontend.

Sync reads all pages of `/me/calendarView` from now through 90 days ahead and requests UTC event times. Recurring occurrences come from Graph's expanded calendar view. Busy, tentative, out-of-office, and working-elsewhere events block availability; free and cancelled events are skipped. All-day events retain their supplied start and exclusive end instants, including UTC offsets.

Refresh tokens rotate on use. A refused grant or repeated unauthorized response enters the existing calendar health flow: failing on the first permanent failure, broken on the second, with reconnect guidance and the same owner notification/backoff as ICS sources. Fetching or parsing failures preserve the previous event cache. The existing hourly cron, manual sync, availability refresh, and ownership-checked disconnect endpoints handle Microsoft sources.

No live Microsoft app or database is needed for the mocked tests. This lane does not apply migrations or validate live consent; the owner must complete that check after registration.
