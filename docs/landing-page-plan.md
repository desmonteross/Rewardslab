# RentRewards landing page: proposed plan

For review before anything is built.

## What we take from each site

**Nyumba Zetu (for property teams):** a warm, calm tone ("less chasing, more peace of mind"), a big editorial headline over a real-life photo, a live product card ("Good morning, Joy · everything is on track"), a before/after section, a six-feature grid, and clear "Sign in" and "Request a demo" buttons.

**Bilt (for renters):** a dark, confident section that shows the journey from paying rent to earning points to getting perks, with small floating cards ("You pay rent · 2,500 pts") and one bold "Start earning" call to action.

RentRewards is both, so the page speaks to two audiences: property managers and landlords first, then tenants. We take layout ideas and mood only. No text, logos, numbers or brand elements are copied.

## Where it lives

Inside the same Next.js app, at `/`.

- Signed-out visitors see the landing page. Signed-in users still go straight to their dashboard or portal, as they do today.
- It sits in its own `(marketing)` route group with its own layout (top nav and footer, no sidebar), so it never mixes with the PMS screens.
- It reuses the app's colours (brand green, the charcoal from the new sidebar), fonts and light/dark themes, and the hero photos already in `public/brand`.

## How it connects to the PMS

| On the landing page | Goes to |
|---|---|
| Sign in | `/login` (staff, landlords and tenants all use it) |
| "I'm a tenant": activate my account | `/tenant/register` |
| Request a demo | A short form (name, company, phone, email, number of units). It saves to a new `demo_requests` table and shows on the platform admin's `/admin` screen. |
| Homes available now *(if you agree)* | Live cards for units listed through Units → Listings: headline, area, bedrooms and asking rent only. This doubles as a first version of Find a Home. |

## Page sections, top to bottom

1. **Top nav:** logo, Features, For tenants, Rental Passport, Find a home, Sign in, Request a demo.
2. **Hero (Nyumba-style):** headline along the lines of "Rent collected. Tenants rewarded.", a sub-line, two buttons, and a photo with a floating product card built from the real dashboard components (collection rate, payments matched today).
3. **What it runs:** M-Pesa matching, a double-entry ledger, landlord settlements, KRA eRITS. These are capabilities, not invented customer numbers.
4. **Before / after:** chasing payments in spreadsheets versus everything matched and receipted.
5. **Feature grid (6):** Collections and M-Pesa, Accounting, Landlord settlements, Maintenance, Tenant portal, Compliance and reports.
6. **For tenants (Bilt-style dark band):** pay rent, then grow your points tree, then better chances at owner discounts and giveaways. The wording matches the app: points are not cash and cannot be redeemed.
7. **Rental Passport (its own section):** the tenant's rental record presented as a passport they carry from home to home.
   - A passport-style card with the record band, score and the five factors behind it (on time, how late, nothing owed, unbroken run, length of tenancy), drawn from the real rental record design.
   - "Stamps" for each tenancy (property, dates, months on time).
   - Plain promises: built only from rent paid; no ID, job or demographic data; every point explained; the tenant chooses who sees it (download as PDF today).
   - For landlords: "Ask applicants for their Rental Passport" as a reason to use RentRewards.
   - Buttons: "Get your Rental Passport" (to tenant activation) and, for managers, "See it in a demo".
8. **Homes available now** *(optional, see question 2).*
9. **Getting started in three steps:** add your properties, invite tenants, collect.
10. **FAQ:** 6 to 8 short answers, using the same + / − style as in the app.
11. **Final call to action and footer.**

## Ground rules

- No made-up testimonials, awards, press logos or customer counts. If we have real ones later, they slot into marked places.
- Mobile-first, fast (mostly static, server-rendered), accessible, and good in both themes.
- Search-friendly title, description and share image.

## Build order

1. The landing page with the sign-in, tenant and demo connections.
2. The "Homes available now" strip, if approved.
3. Later: a pricing section and a full Find a Home browsing page.

## Decisions needed from Des

1. **Pricing:** leave it off for now and just say "Talk to us" (recommended), or show prices (you would need to give them to me).
2. **Homes available now:** show listed vacant units publicly on the landing page (recommended, since that is what listing is for), or leave it for the Find a Home integration.
3. **Demo requests:** save them in the system for the platform admin (recommended), or only show your email and phone.
4. **Name inside the app:** also rename "Rental record" to "Rental Passport" in the tenant portal, the staff tenant page and the PDF, so the landing page and the product use one name *(recommended)*, or keep "Rental record" inside the app.
