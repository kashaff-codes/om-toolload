# C5 distractor-005 run 1

**Q:** What email address do you have on file for Jon Smyth?

**Expected:** {"type":"exact","value":"jon.smyth58@fastmail.com"}

**Answer:** We have jon.smyth58@fastmail.com on file for Jon Smyth, customer ID CUS-87584.

**Exact:** correct · **Judge:** correct

## Observations the actor read (685 tokens)

```
Date: Sep 8, 2026
* 🔴 (20:00) User said they help manage a relative's account and asked to pull up customer Jon Smyth, CUS-87584.
  * -> Jon Smyth: Raleigh, NC; tier "plus"; member since 2023-04-11; marketing opt-in false; SMS false; en-US.
  * -> No open tickets for CUS-87584.
  * ✅ Jon Smyth's profile lookup completed; account active, no open tickets.

Date: Sep 13, 2026
* 🔴 (20:00) User asked to check where their screen protector order is.
  * -> Order ORD-7375 (customer CUS-22131): 1x tempered glass screen protector (SKU SP-GL2), $12.99; total $20.05 incl. $5.99 shipping; PayPal ending 3373; placed 2026-09-07; priority flag true; ships to 735 Sparrow Pl, Madison, WI 53755.
  * -> Shipment via FedEx express, tracking 404068569921, status in_transit, estimated delivery 2026-09-13 15:00 UTC (a Sunday).
  * -> Tracking event timestamps look inconsistent (label_created and picked_up are out of order).
  * -> Assistant said it shipped with FedEx and was "on schedule for Friday", which does not match the estimated delivery date in the data.
  * ✅ Screen protector order status answered (in transit via FedEx, tracking 404068569921).

Date: Sep 15, 2026
* 🔴 (20:00) User stated they are John Smith, CUS-22131, and asked to check their own profile. This is the same account as the screen protector order (ORD-7375).
  * -> John Smith: Madison, WI; tier "pro"; member since 2023-04-11; marketing opt-in true; SMS false; en-US.
  * -> No open tickets for CUS-22131.
  * ✅ User's own profile checked; account active, nothing open.

Pinned values (copied verbatim from tool results):
- getCustomer(CUS-87584): customer_id=CUS-87584; name=Jon Smyth; email=jon.smyth58@fastmail.com; default_address=6633 Willow Ct, Raleigh, NC 27623
- getOrder(ORD-7375): order_id=ORD-7375; customer_id=CUS-22131; status=shipped; placed_at=2026-09-07T15:00:00.000Z; name=tempered glass screen protector; total=20.05; ship_to=735 Sparrow Pl, Madison, WI 53755
- getShipment(ORD-7375): order_id=ORD-7375; tracking_number=404068569921; status=in_transit; estimated_delivery=2026-09-13T15:00:00.000Z; destination=735 Sparrow Pl, Madison, WI 53755
- getCustomer(CUS-22131): customer_id=CUS-22131; name=John Smith; email=john.smith44@outlook.com; default_address=735 Sparrow Pl, Madison, WI 53755
```
