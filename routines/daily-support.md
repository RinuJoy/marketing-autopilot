Daily support drafts for Picproved (weekdays 08:30 UK). Drafts replies; never sends.

Needs the Gmail connector of the inbox that support@picproved.com forwards to. Nothing else in this repository
touches Gmail, and this routine only ever creates drafts.

1. Clone RinuJoy/Picproved (shallow) and read `server/support-mail/answers.js`: the answers to what customers ask
   most, the same ones the automatic reply already sent them. Read `js/shop-config.js` for `SHOP.promiseDays` and the
   prices if a question needs them.
2. In Gmail, search `to:support@picproved.com newer_than:3d -from:me`. For each thread:
   - Skip it if the newest message is from us, a draft already exists on it, or it is from a robot (Paddle, Google,
     Brevo, Cloudflare, GitHub, any no-reply address, newsletters).
   - Otherwise create a reply draft in that thread (Gmail `create_draft` with the thread's id), in the customer's own
     language, short and warm, signed "Picproved support". Answer the actual question; use answers.js for the facts and
     the exact button names ("Free redo", "Redeem a key", Orders). Ask for the order ID (SNP-XXXX-XXXX) when the
     answer needs one and it isn't given.
   - Refund asked for: draft "We've refunded order SNP-…; Paddle shows it on your card in 5 to 10 working days" but
     put `[CHECK: refund in Paddle first]` as the draft's first line. Refunds are made by hand in Paddle or Play;
     never say one is done when it isn't.
   - Anything legal, a complaint, a chargeback, press, a business offer or something answers.js doesn't cover:
     draft a holding reply and put `[RINU: …]` as the first line saying what needs a decision.
3. Never send, delete, archive, label, mark read, or unsubscribe. Never promise anything answers.js and the app don't
   (no "guaranteed", no dates the app doesn't give). Never paste an order key (SNP1.…) or anyone's photo.
4. Finish with a summary in plain English: how many threads, one line per draft (who, what they asked, what the
   draft says, any [CHECK]/[RINU] flag), and any question that came up twice or more, which may belong in
   answers.js.
