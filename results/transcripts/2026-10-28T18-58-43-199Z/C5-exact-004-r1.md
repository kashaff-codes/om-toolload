# C5 exact-004 run 1

**Q:** What street address is my monitor being shipped to?

**Expected:** {"type":"exact","value":"9602 Willow Ct"}

**Answer:** Your monitor is being shipped to 9602 Willow Ct, Boise, ID 83763.

**Exact:** correct · **Judge:** correct

## Observations the actor read (1306 tokens)

```
Date: Sep 4, 2026
* 🔴 (20:00) User asked to confirm profile and check open tickets.
  * -> Customer CUS-98521 (Priya Nair, priya.nair8@proton.me), default address 7775 Orchard Way, Raleigh NC 27630, tier "plus", member since 2023-04-11, marketing opt-in true, SMS off, en-US. No open tickets.
  * ✅ (20:01) Profile confirmed, no open tickets.

Date: Sep 8, 2026
* 🔴 (20:00) User asked if monitor shipment is on the way.
  * -> ORD-5495: 27-inch monitor (SKU MN-27Q), qty 1, placed Sep 2, 2026, total $356.14 (subtotal $329, tax $27.14, shipping $0), card ending 8158, shipped.
  * -> Ship-to 9602 Willow Ct, Boise ID 83763 (NOT the Raleigh profile address).
  * -> USPS ground, tracking 9400884526493979603507, in_transit, last event SEA-1 hub, est. delivery Sep 6, 2026.
  * 🟡 Assistant wrongly said "Wednesday" arrival (conflicted with Sep 6 date).
  * ✅ Monitor in transit with USPS (est. Sep 6, 2026).

Date: Sep 12, 2026
* 🔴 (20:00) User asked where laptop stand order is.
  * -> ORD-9853: aluminum laptop stand (SKU LS-ADJ), qty 1, placed Sep 7, 2026, total $48.21 (subtotal $39, shipping $5.99, tax $3.22), PayPal ending 8812, shipped.
  * -> Ship-to 7775 Orchard Way, Raleigh NC 27630.
  * -> USPS express, tracking 9400254053157688769519, in_transit, last event departed SEA-1 hub, est. delivery Sep 13, 2026.
  * 🟡 Assistant wrongly said "Wednesday" (conflicted with Sep 13 date).
  * ✅ Laptop stand in transit with USPS (est. Sep 13, 2026).

Date: Sep 16, 2026
* 🔴 (20:00) User asked to check account details and open tickets.
  * -> Phone +1-555-265-6344 on file. Tier changed from "plus" (Sep 4) to "standard". Other fields unchanged.
  * -> Open ticket TKT-584611: type newsletter, no order, created Sep 9, 2026, summary "Customer reported a minor account issue.", assignee tier2-queue, status open.
  * ✅ Account details and open ticket reported. Assistant said profile is current. Active work on ticket not confirmed.

Date: Sep 21, 2026
* 🔴 (20:00) User asked where HDMI cable order is.
  * -> ORD-5502: braided HDMI cable (SKU HC-2M), qty 1, placed Sep 15, 2026, total $22.22 (subtotal $14.99, tax $1.24, shipping $5.99), Apple Pay ending 7453, priority flag, ship-to 7775 Orchard Way, Raleigh NC.
  * -> UPS express, tracking 1Z1BC19A5614772484, in_transit, est. delivery Sep 21, 2026. Latest event out_for_delivery (Sep 19, ORD-7-HUB); timestamps out of order, status may be stale.
  * 🟡 Assistant wrongly said "Friday" (Sep 21, 2026 is a Monday).
  * ✅ HDMI cable status answered (UPS, in transit, est. Sep 21, 2026).

Date: Sep 23, 2026
* 🔴 (20:00) User asked where coffee grinder order is.
  * -> ORD-4612: burr coffee grinder (SKU CG-BR1), qty 1, placed Sep 20, 2026, total $96.34 (subtotal $89, tax $7.34, shipping $0), card ending 1412, priority flag, ship-to 7775 Orchard Way, Raleigh NC.
  * -> DHL express, tracking JD014630120724, in_transit, departed ATL-3-HUB Sep 23, est. delivery Sep 26, 2026.
  * 🟡 Assistant wrongly said "Tuesday" (Sep 26, 2026 is a Saturday).
  * ✅ Coffee grinder status answered (DHL, in transit, est. Sep 26, 2026).

Pattern: Assistant gave wrong weekday names for 4 shipments. Always state calendar dates from tool data, never weekday names.

Reference: Customer CUS-98521 (Priya Nair, priya.nair8@proton.me). Orders: ORD-5495 (monitor, Boise ship-to), ORD-9853 (laptop stand), ORD-5502 (HDMI), ORD-4612 (grinder). Open ticket: TKT-584611.

Pinned tool values:
- getCustomer(CUS-98521): name=Priya Nair; email=priya.nair8@proton.me; default_address=7775 Orchard Way, Raleigh, NC 27630
- getOrder/getShipment ORD-5495: tracking=9400884526493979603507; in_transit; est=2026-09-06T15:00:00.000Z; ship_to=9602 Willow Ct, Boise, ID 83763; total=356.14
- getOrder/getShipment ORD-9853: tracking=9400254053157688769519; in_transit; est=2026-09-13T15:00:00.000Z; ship_to=7775 Orchard Way, Raleigh, NC 27630; total=48.21
- getOrder/getShipment ORD-5502: tracking=1Z1BC19A5614772484; in_transit; est=2026-09-21T15:00:00.000Z; total=22.22
- getOrder/getShipment ORD-4612: tracking=JD014630120724; in_transit; est=2026-09-26T15:00:00.000Z; total=96.34
- searchTickets: TKT-584611; order_id=-; status=open
```
