# C5 exact-009 run 1

**Q:** What street address is my router being shipped to?

**Expected:** {"type":"exact","value":"8279 Cedar Ridge Rd"}

**Answer:** It's being shipped to 8279 Cedar Ridge Rd, Madison, WI 53746.

**Exact:** correct · **Judge:** correct

## Observations the actor read (1214 tokens)

```
* 🔴 (20:00) User asked assistant to confirm profile and any open tickets.
  * -> Customer CUS-72897: Lucas Moreau, lucas.moreau49@fastmail.com, +1-555-700-4183, 3496 Beacon St, Portland, OR 97246, member since 2023-04-11, tier "pro", marketing_opt_in true, sms true, language en-US.
  * -> Open tickets: 0.
  * ✅ (20:01) Profile confirmed; no open tickets; assistant told user so.
* 🔴 (20:00) User asked assistant to make sure account details are current and whether they have open tickets.
  * -> Profile changed since Sep 9: tier now "standard" (was "pro"), sms now false (was true). Name, email, phone, address, marketing_opt_in true unchanged.
  * -> Open tickets: 1, TKT-169045, type login_issue, created 2026-09-06, summary "Customer reported a minor account issue.", assigned tier1-queue, no order ID or refund.
  * ✅ (20:01) Account details reviewed; assistant told user one open login ticket (TKT-169045) is with support.
* 🔴 (20:00) User asked where their cable organizer order is.
  * -> ORD-9650: "cable organizer kit" (SKU CO-KIT), qty 1, subtotal $18, total $25.48, placed 2026-09-12, status shipped, card ending 6935, ship to 3496 Beacon St, Portland, OR 97246.
  * -> Shipment: DHL, tracking JD014690573556, 2day, in_transit, est. delivery 2026-09-18.
  * -> Assistant earlier said "Wednesday"; corrected fact: 2026-09-18 is a Friday.
  * ✅ (20:01) ORD-9650 status answered (DHL JD014690573556, est. Fri 2026-09-18).
* 🟡 (20:00) User said "I'm thinking of buying another laptop stand"; asked about last order and delivery.
  * -> ORD-7300: "aluminum laptop stand" (SKU LS-ADJ), qty 1, subtotal $39, total $48.21, placed 2026-08-19, delivered, Apple Pay ending 0377, priority true, ship to Portland, OR.
  * -> No tickets for laptop stand orders.
  * ✅ (20:01) ORD-7300 confirmed delivered, no tickets; assistant answered.
* 🔴 (20:00) User asked whether router shipment is on the way.
  * -> ORD-7386: "wifi router" (SKU RT-AX6), qty 1, subtotal $179, total $193.77, placed 2026-09-07, shipped, PayPal ending 0935.
  * -> Ship-to: 8279 Cedar Ridge Rd, Madison, WI 53746 (differs from profile address Portland, OR).
  * -> Shipment: FedEx, tracking 297560434453, 2day, in_transit, est. delivery 2026-09-11 (already past), delivered_at null.
  * -> Assistant said "Tuesday" arrival; this is not supported by tool data (est. date passed, still in_transit). Correct if user asks.

Pinned values (copied verbatim from tool results):
- getCustomer(CUS-72897): customer_id=CUS-72897; name=Lucas Moreau; email=lucas.moreau49@fastmail.com; default_address=3496 Beacon St, Portland, OR 97246
- getCustomer(CUS-72897): customer_id=CUS-72897; name=Lucas Moreau; email=lucas.moreau49@fastmail.com; default_address=3496 Beacon St, Portland, OR 97246
- searchTickets(open tickets): ticket_id=TKT-169045; order_id=-; status=open
- getOrder(ORD-9650): order_id=ORD-9650; customer_id=CUS-72897; status=shipped; placed_at=2026-09-12T15:00:00.000Z; name=cable organizer kit; total=25.48; ship_to=3496 Beacon St, Portland, OR 97246
- getShipment(ORD-9650): order_id=ORD-9650; tracking_number=JD014690573556; status=in_transit; estimated_delivery=2026-09-18T15:00:00.000Z; destination=3496 Beacon St, Portland, OR 97246
- getOrder(ORD-7300): order_id=ORD-7300; customer_id=CUS-72897; status=delivered; placed_at=2026-08-19T15:00:00.000Z; name=aluminum laptop stand; total=48.21; ship_to=3496 Beacon St, Portland, OR 97246
- getOrder(ORD-7386): order_id=ORD-7386; customer_id=CUS-72897; status=shipped; placed_at=2026-09-07T15:00:00.000Z; name=wifi router; total=193.77; ship_to=8279 Cedar Ridge Rd, Madison, WI 53746
- getShipment(ORD-7386): order_id=ORD-7386; tracking_number=297560434453; status=in_transit; estimated_delivery=2026-09-11T15:00:00.000Z; destination=8279 Cedar Ridge Rd, Madison, WI 53746
```
