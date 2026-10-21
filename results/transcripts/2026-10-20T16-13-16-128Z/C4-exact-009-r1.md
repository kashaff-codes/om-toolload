# C4 exact-009 run 1

**Q:** What street address is my router being shipped to?

**Expected:** {"type":"exact","value":"8279 Cedar Ridge Rd"}

**Answer:** 3496 Beacon St, Portland, OR 97246.

**Exact:** silent_failure · **Judge:** silent_failure

## Observations the actor read (832 tokens)

```
<observation-group id="49e6a129eed2d194" range="exact-009-s0-t0:exact-009-s1-t3">
Date: Sep 9 2026
* 🔴 (8:01 PM) User asked to confirm profile and open tickets.
* 🔴 (8:01 PM) User's customer ID is "CUS-72897".
* 🔴 (8:01 PM) User's customer profile: name "Lucas Moreau", email "lucas.moreau49@fastmail.com", phone "+1-555-700-4183".
* 🔴 (8:01 PM) User's default address: "3496 Beacon St", "Portland", "OR", "97246".
* 🔴 (8:01 PM) User's membership tier is "pro".
* 🔴 (8:01 PM) User's preferences: marketing opt-in true, SMS true, language "en-US".
* 🔴 (8:01 PM) User's account was created on "2023-04-11".
* 🔴 (8:01 PM) User's audit log: several entries with actions, actors, and request IDs.
* 🔴 (8:01 PM) User's inventory snapshot: a list of items with their quantities.
* 🔴 (8:01 PM) User has no open tickets.
* 🔴 (8:01 PM) User asked about open tickets again.
* 🔴 (8:01 PM) User's customer ID is still "CUS-72897".
* 🔴 (8:01 PM) User's customer profile: name "Lucas Moreau", email "lucas.moreau49@fastmail.com", phone "+1-555-700-4183".
* 🔴 (8:01 PM) User's default address: "3496 Beacon St", "Portland", "OR", "97246".
* 🔴 (8:01 PM) User's membership tier is now "standard".
* 🔴 (8:01 PM) User's preferences: marketing opt-in true, SMS false, language "en-US".
* 🔴 (8:01 PM) User's audit log: several entries with actions, actors, and request IDs.
* 🔴 (8:01 PM) User's inventory snapshot: a list of items with their quantities.
* 🔴 (8:01 PM) User has one open ticket: ticket ID "TKT-169045", type "login issue", status "open".
</observation-group>

--- message boundary (2026-09-25T15:01:00.000Z) ---

<observation-group id="a4bb6f4a00b683e1" range="exact-009-s2-t0:exact-009-s4-t3">
* The customer ordered an aluminum laptop stand (LS-ADJ) with a subtotal of $39 and had it shipped to 3496 Beacon St, Portland, OR 97246.
* The customer's laptop stand order was delivered without any issues.
* The customer's router shipment is on its way with FedEx and should arrive on Tuesday.
* The customer's router was shipped on September 7, 2026, and the estimated delivery date was September 11, 2026.
* The router was shipped from EWR-1 fulfillment center with a tracking number of 297560434453.
* The customer's router order had a subtotal of $179, tax of $14.77, and a total of $193.77.
* The customer paid for the router with PayPal.
* The customer's router order was updated on September 19, 2026, and the status was updated to "in_transit".
* The customer's router order had several events, including label creation, picked up, arrived at facility, departed facility, and in_transit.
* The customer's router order had several inventory snapshots, including on_hand quantities and reserved quantities for various warehouses.
* The customer's router order had several audit logs, including updates, reads, and cache refreshes.
</observation-group>
```
