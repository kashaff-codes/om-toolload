# C4 exact-009 run 1

**Q:** What street address is my router being shipped to?

**Expected:** {"type":"exact","value":"8279 Cedar Ridge Rd"}

**Answer:** Your router is being shipped to 8279 Cedar Ridge Rd, Madison WI 53746.

**Exact:** correct · **Judge:** correct

## Observations the actor read (986 tokens)

```
<observation-group id="cf42eb01a2d99079" range="exact-009-s0-t0:exact-009-s1-t3">
Date: Sep 9, 2026
* 🔴 (20:00) User asked to confirm their profile and any open tickets.
  * -> getCustomer CUS-72897: Lucas Moreau, lucas.moreau49@fastmail.com, +1-555-700-4183, 3496 Beacon St, Portland OR 97246, member since 2023-04-11, tier "pro", marketing_opt_in true, sms true, language en-US.
  * -> searchTickets "open tickets": 0 results.
  * ✅ (20:01) Profile confirmed and no open tickets reported to user.

Date: Sep 13, 2026
* 🔴 (20:00) User asked to make sure account details are up to date and whether they have any open tickets.
  * -> getCustomer CUS-72897 now shows tier "standard" (changed from "pro" on Sep 9), sms false (changed from true on Sep 9), marketing_opt_in true, same name, email, phone, and address.
  * -> searchTickets "open tickets": 1 open ticket, TKT-169045, type login_issue, created 2026-09-06, summary "Customer reported a minor account issue.", assignee tier1-queue, no order_id, no refund.
  * ✅ (20:01) Account details reported as current and the one open ticket (TKT-169045, login issue, tier1-queue) reported to user. Assistant said the team is working on it.
  * 🟡 (20:01) User's account tier changed from pro to standard and SMS notifications changed from on to off between Sep 9 and Sep 13, 2026.
</observation-group>

--- message boundary (2026-09-25T15:01:00.000Z) ---

<observation-group id="947677bc274f887a" range="exact-009-s2-t0:exact-009-s4-t3">
* 🔴 (20:00) User asked where their cable organizer order is.
  * -> getOrder ORD-9650: cable organizer kit (SKU CO-KIT), qty 1, $18, total $25.48, placed 2026-09-12, status shipped, card ending 6935, ships to 3496 Beacon St, Portland OR 97246.
  * -> getShipment ORD-9650: DHL, tracking JD014690573556, 2-day service, in_transit, estimated delivery 2026-09-18 (Friday).
  * -> Assistant said it shipped with DHL and is on schedule for "Wednesday". Error: 2026-09-18 is a Friday.
  * ✅ (20:01) Cable organizer order status reported (DHL, in transit, est. delivery Sep 18).
* 🔴 (20:00) User said they are "thinking of buying another laptop stand" and asked what they ordered last time and whether it was delivered.
  * -> getOrder ORD-7300: aluminum laptop stand (SKU LS-ADJ), qty 1, $39, total $48.21, placed 2026-08-19, status delivered, Apple Pay ending 0377, ships to Portland OR.
  * -> searchTickets "laptop stand order history": 0 results.
  * ✅ (20:01) Last laptop stand order (ORD-7300) reported as delivered with no tickets.
* 🔴 (20:00) User asked whether their router shipment is on the way.
  * -> getOrder ORD-7386: wifi router (SKU RT-AX6), qty 1, $179, total $193.77 (shipping $0), placed 2026-09-07, status shipped, PayPal ending 0935.
  * -> Ship-to is 8279 Cedar Ridge Rd, Madison WI 53746. This differs from the profile address (3496 Beacon St, Portland OR).
  * -> getShipment ORD-7386: FedEx, tracking 297560434453, 2-day service, in_transit, estimated delivery 2026-09-11 (already past as of Sep 25, not yet delivered).
  * -> Assistant said it is on its way with FedEx and should arrive Tuesday. Assistant did not mention the past estimated delivery date or the different ship-to address.
* 🟡 (20:01) Router order ORD-7386 has a ship-to address different from the account address. Its estimated delivery date has passed, so the delivery is overdue or the estimate is stale.
</observation-group>
```
