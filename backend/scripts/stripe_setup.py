"""One-time Stripe setup: creates the TimeIQ product and yearly prices.

Usage:
    STRIPE_SECRET_KEY=sk_test_... .venv/bin/python scripts/stripe_setup.py

Prints the env lines to add to backend/.env.local and Vercel.
"""
import os
import sys

import stripe

key = os.environ.get("STRIPE_SECRET_KEY")
if not key:
    sys.exit("Set STRIPE_SECRET_KEY first")
stripe.api_key = key

product = stripe.Product.create(
    name="TimeIQ",
    description="Scheduling, time tracking, and invoicing in one calm workspace.",
)
founder = stripe.Price.create(
    product=product.id,
    unit_amount=500,
    currency="usd",
    recurring={"interval": "year"},
    nickname="Founding member — $5/year",
)
standard = stripe.Price.create(
    product=product.id,
    unit_amount=2900,
    currency="usd",
    recurring={"interval": "year"},
    nickname="Standard — $29/year",
)

print("Add these to backend env:")
print(f"STRIPE_PRICE_FOUNDER={founder.id}")
print(f"STRIPE_PRICE_STANDARD={standard.id}")
print("FOUNDER_SEATS=100")
