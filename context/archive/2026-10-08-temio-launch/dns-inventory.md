# temio.pl — DNS inventory

> **Not the verbatim OVH export.** Phase 4 was done in the dashboards before this
> file existed, so this is a snapshot of the live zone taken on 2026-10-08 with
> `dig` from public resolvers, **after** the nameservers moved to Cloudflare, and
> updated after Phase 5 and the impl review (F3). If the
> OVH text export ("Change in text format") is still available, paste it below
> under "OVH export" — it is the real rollback source. The OVH zone itself was not
> deleted, so putting OVH's nameservers back restores it.

## Nameservers

| Before (OVH) | After (Cloudflare) |
| --- | --- |
| `dns111.ovh.net`, `ns111.ovh.net` | `cass.ns.cloudflare.com`, `graham.ns.cloudflare.com` |

## Mail records (all DNS-only in Cloudflare)

| Name | Type | Value |
| --- | --- | --- |
| `temio.pl` | MX | `1 mx0.mail.ovh.net.` |
| `temio.pl` | MX | `5 mx1.mail.ovh.net.` |
| `temio.pl` | MX | `50 mx2.mail.ovh.net.` |
| `temio.pl` | MX | `100 mx3.mail.ovh.net.` |
| `temio.pl` | TXT (SPF) | `v=spf1 include:mx.ovh.com ~all` |
| `_dmarc.temio.pl` | TXT | `v=DMARC1; p=none; aspf=r` |
| `autodiscover.temio.pl` | CNAME | — (none) |
| `autoconfig.temio.pl` | CNAME | — (none) |
| `*._domainkey.temio.pl` (OVH DKIM) | TXT | — (none found) |
| `_*._tcp.temio.pl` (SRV, e.g. `_imaps`, `_submission`) | SRV | — (none found) |

## Records added in Phase 5 (Resend, all DNS-only)

| Name | Type | Value |
| --- | --- | --- |
| `send.temio.pl` | CNAME | `send.forge.rmta.net.` (resolves to MX `10 feedback.forge.rmta.net.` and SPF `v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all`) |
| `rsend.temio.pl` | CNAME | `rsend-euw1.forge.rmta.net.` (bounce / Return-Path domain, EU region) |
| `resend._domainkey.temio.pl` | TXT | DKIM public key `p=MIGfMA0GCSqGSIb3…` |

Other TXT on the apex: `1|www.temio.pl` (OVH's legacy redirect marker, harmless).

## DNSSEC

- At OVH before the move: **enabled**; Janusz turned it off at OVH before the nameserver change, and `dig DS temio.pl +short` was empty before the switch.
- After the move: enabled in Cloudflare, DS added at OVH (the registrar) — `2371 13 2 9A081D93…`. Validates: `dig @1.1.1.1 temio.pl +dnssec` and `@8.8.8.8` answer with the `ad` flag (2026-10-08).

## DMARC decision (Phase 5 step 2)

OVH already published `_dmarc` with `p=none; aspf=r`. It is not stricter than
`p=none`, so it **stays**, and no second `_dmarc` record is added (two DMARC
records make receivers ignore DMARC altogether). Optional: add
`rua=mailto:kontakt@temio.pl` to this record to receive aggregate reports.

## OVH export

_(paste here if available)_
