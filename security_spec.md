# Security Specification — nails.marianacastro Online Booking System

## 1. Data Invariants
1. **Default Deny**: All paths not explicitly matched are denied for both read and write (`match /{document=**} { allow read, write: if false; }`).
2. **PII Isolation (Split Collection Pattern)**: Client PII (`clientName`, `clientPhone`, `clientInstagram`, `notes`) is stored exclusively in `/appointments/{appointmentId}`. Public availability checks query `/bookedSlots/{slotId}`, which contains zero PII.
3. **Appointment Listing Restricted to Admin**: `list` on `/appointments` is strictly restricted to verified administrators (`isAdmin()`). Individual clients can `get` their own appointment receipt by knowing the specific `appointmentId` or admin can read all.
4. **Atomic Booking Invariant**: Creating a public `/appointments/{appointmentId}` record requires a synchronous atomic write to `/bookedSlots/$(incoming().slotId)` verified via `existsAfter()`, preventing phantom bookings or unreserved slots.
5. **Strict Key & Size Enforcement**: Every string is bounded by `.size()` and regex patterns where applicable; every `create` validates `.keys().hasAll()` and `.keys().hasOnly()`; every `update` validates `affectedKeys().hasOnly()`.
6. **Temporal Integrity**: `createdAt == request.time` on create; `updatedAt == request.time` on update; `createdAt` is immutable on update.
7. **Terminal State Locking**: Once an appointment reaches `completed` or `cancelled`, non-admin updates are locked.

## 2. The "Dirty Dozen" Payloads
1. **Shadow Field Injection on Appointment Create**: Payload includes `"isVip": true` not in `hasOnly()` -> `PERMISSION_DENIED`.
2. **Oversized Client Name (Denial of Wallet)**: `clientName` with 5000 chars (`> 80`) -> `PERMISSION_DENIED`.
3. **Invalid Protocol Code Format**: `protocolCode: "HACK-123"` (fails `^MC-[A-Z0-9]{6}$`) -> `PERMISSION_DENIED`.
4. **Timestamp Forgery on Create**: `createdAt` set to past/future timestamp instead of `request.time` -> `PERMISSION_DENIED`.
5. **Unauthenticated List on `/appointments` (PII Scraping)**: Anonymous user calls `getDocs(collection(db, 'appointments'))` -> `PERMISSION_DENIED`.
6. **Spoofed Admin Email Without Verification**: `request.auth.token.email == 'lyalua31@gmail.com'` with `email_verified: false` -> `PERMISSION_DENIED`.
7. **Orphaned Appointment Without BookedSlot**: Creating `/appointments/{id}` without atomically creating `/bookedSlots/{slotId}` in the same batch -> `PERMISSION_DENIED`.
8. **Mutating Immutable `createdAt` or `protocolCode` on Update**: Updating `protocolCode` on an existing appointment -> `PERMISSION_DENIED`.
9. **Unauthorized Service Price Modification**: Public client tries to update `/services/{serviceId}` `priceCents` to `100` -> `PERMISSION_DENIED`.
10. **ID Poisoning**: Document ID with special characters or length > 128 -> `PERMISSION_DENIED`.
11. **Self-Assigned Admin Privilege**: Authenticated non-admin user tries to create `/admins/{uid}` -> `PERMISSION_DENIED`.
12. **Client Confirming Own Appointment**: Public user tries to update `/appointments/{id}` `status` from `pending` to `confirmed` (only allowed to cancel via protocol receipt or admin update) -> `PERMISSION_DENIED`.
