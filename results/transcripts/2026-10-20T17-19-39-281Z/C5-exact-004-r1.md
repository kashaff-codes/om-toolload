# C5 exact-004 run 1

**Q:** What street address is my monitor being shipped to?

**Expected:** {"type":"exact","value":"9602 Willow Ct"}

**Answer:** The monitor, with order number ORD-5495, is being shipped to 9602 Willow Ct, Boise ID 83763.

**Exact:** correct · **Judge:** correct

## Observations the actor read (1084 tokens)

```
Date: Sep 2, 2026 to Sep 16, 2026 (condensed earlier history)
* 🔴 Customer: Priya Nair, ID CUS-98521, Raleigh NC, member since 2023-04-11, tier "standard" (earlier "plus" note was wrong), phone +1-555-265-6344, email priya.nair8@proton.me, default address 7775 Orchard Way, Raleigh NC 27630, marketing opt-in true, SMS false, en-US.
* 🔴 (Sep 2, 20:00) User asked to confirm profile and open tickets. ✅ Profile confirmed to user; no open tickets at that time.
* 🔴 (Sep 2, 20:00) Monitor order ORD-5495 (placed 2026-09-02): 27-inch monitor (SKU MN-27Q), qty 1, total $356.14 (incl. $27.14 tax, free shipping), card ending 8158. Ship-to 9602 Willow Ct, Boise ID 83763 (differs from default).
  * -> USPS ground, tracking 9400884526493979603507, in_transit, estimated_delivery 2026-09-06.
  * ✅ Told user monitor is in transit with USPS.
  * 🟡 Assistant earlier said "Wednesday" (Sep 9); tool ETA is Sep 6. Tracking events out of order.
* 🔴 (Sep 2, 20:00) Laptop stand order ORD-9853 (placed 2026-09-07): aluminum laptop stand (SKU LS-ADJ), qty 1, total $48.21 (incl. $5.99 shipping, $3.22 tax), PayPal ending 8812, ship-to 7775 Orchard Way, Raleigh NC 27630.
  * -> USPS express, tracking 9400254053157688769519, in_transit, last event departed SEA-1-HUB Sep 9, estimated_delivery 2026-09-13.
  * ✅ Told user laptop stand is in transit (assistant said "on schedule for Wednesday"; conflicts with tool ETA Sep 13).
* 🔴 (Sep 16, 20:00) User asked to confirm account details and open tickets.
  * -> Open ticket search: 1 ticket, TKT-584611, type newsletter, created 2026-09-09, summary "Customer reported a minor account issue.", assignee tier2-queue, no order linked.
  * ✅ Told user profile is current and they have one open ticket (TKT-584611) being worked by the team.
* 🔴 (Sep 21, 20:00) HDMI cable order ORD-5502 (placed 2026-09-15): braided HDMI cable (SKU HC-2M), qty 1, total $22.22 (subtotal $14.99, tax $1.24, shipping $5.99), Apple Pay ending 7453, ship-to 7775 Orchard Way, fulfillment DFW-4, priority.
  * -> UPS express, tracking 1Z1BC19A5614772484, in_transit, 1.5 kg, 49x20x8 cm, estimated_delivery 2026-09-21. Out_for_delivery event at ORD-7-HUB on 2026-09-19 (timestamps inconsistent).
  * ✅ Told user HDMI cable shipped via UPS ("on schedule for Friday"; conflicts with tool ETA Sep 21, a Monday).
* 🔴 (Sep 23, 20:00) Coffee grinder order ORD-4612 (placed 2026-09-20): burr coffee grinder (SKU CG-BR1), qty 1, total $96.34 (subtotal $89.00, tax $7.34, free shipping), card ending 1412, ship-to 7775 Orchard Way, fulfillment RNO-2, priority.
  * -> DHL express, tracking JD014630120724, in_transit, 0.28 kg, 43x38x4 cm, estimated_delivery 2026-09-26. Latest event: departed ATL-3-HUB 2026-09-23.
  * ✅ Told user grinder shipped via DHL ("on schedule for Tuesday"; conflicts with tool ETA Sep 26, a Saturday).
* 🟡 Pattern: assistant repeatedly gave weekday ETAs that conflicted with tool estimated_delivery dates. Always quote tool dates.

Pinned tool values (verbatim):
- ORD-5495: status=shipped; total=356.14; ship_to=9602 Willow Ct, Boise, ID 83763; tracking=9400884526493979603507; in_transit; est_delivery=2026-09-06
- ORD-9853: status=shipped; total=48.21; tracking=9400254053157688769519; in_transit; est_delivery=2026-09-13
- TKT-584611: status=open; order_id=-
- ORD-5502: status=shipped; total=22.22; tracking=1Z1BC19A5614772484; in_transit; est_delivery=2026-09-21
- ORD-4612: status=shipped; total=96.34; tracking=JD014630120724; in_transit; est_delivery=2026-09-26
```
