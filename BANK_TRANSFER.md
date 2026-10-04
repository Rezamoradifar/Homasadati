# Homay bank transfer and private receipt review

Customers can choose bank transfer in the cart, direct product orders and subscription renewals. Amounts on the payment form are IRR; existing order accounting remains in toman. The server multiplies the authoritative order total by ten and rejects a different declared amount.

The destination uses the supplied Parsian card and company/contact details. The supplied IBAN failed mod-97 and is intentionally not offered as a destination. Card checksum validity does not establish ownership. Merchant labels are supplied information.

Customers submit a JPEG, PNG or WebP image, time, amount and reference. Images are bounded to 5 MiB, decoded/re-encoded and stripped of metadata. Private images are stored inside SQLite, so the existing database backup retains receipts. Only the customer and finance/superadmin roles may view them.

A receipt does not mark an order paid. A finance/superadmin reviewer must inspect the actual bank statement, enter the reference and exact amount in IRR, and confirm reconciliation. Approval settles the existing order/cart once using existing inventory, commission and subscription logic. Reviewers cannot approve their own receipt. Rejections require a reason and permit resubmission with a new 24-hour deadline.

Pending receipt reviews hold reserved inventory until a human decision. The expiry worker skips them and cancellation is blocked while pending. Administrators should review the queue regularly. Duplicate active receipt hashes, claimed references, verified references and repeated approval cannot create a second payment. These checks do not prove screenshots authentic.

## Routes

- GET /api/platform/bank-payments/orders/:orderId for owned amount, destination and history.
- POST /api/platform/bank-payments/orders/:orderId for raw image; headers X-Receipt-Reference, X-Transferred-At (ISO), X-Amount-Rial.
- GET /api/platform/bank-payments/receipts/:id/image for authenticated private image.
- GET /api/platform/admin/bank-receipts for paginated status/search.
- PATCH /api/platform/admin/bank-receipts for approval/rejection with audit and notification.

Migration 9 rebuilds existing payment CHECK constraints while preserving rows, foreign keys and indexes; adds receipts and unique indexes. No new package dependency.

## Deployment

Fetch the release branch, extract scripts/deploy-bank-transfer.sh and run as root with the full release commit SHA. It stages on the server's existing HEAD, cherry-picks only this release, and builds before changing the running application. Conflicts and overlapping local edits stop it. Configuration is preserved. The existing backup command saves the database and receipts; the previous build is retained. Post-stop failures restore source/build. Use the release commit rather than a future merge commit.

This implements manual transfer and receipt review. It does not call Parsian PSP, collect payment card credentials or verify receipts against a bank API.
