# temio.pl — DNS inventory

> **Not the verbatim OVH export.** Phase 4 was done in the dashboards before this
> file existed, so this is a snapshot of the live zone taken on 2026-10-08 with
> `dig` from public resolvers, **after** the nameservers moved to Cloudflare. If the
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

Other TXT on the apex: `1|www.temio.pl` (OVH's legacy redirect marker, harmless).

## DNSSEC

- At OVH before the move: not recorded.
- In Cloudflare: **not yet enabled** — `dig DS temio.pl +short` is empty on 2026-10-08 (Phase 4 step 6, last part).

## DMARC decision (Phase 5 step 2)

OVH already published `_dmarc` with `p=none; aspf=r`. It is not stricter than
`p=none`, so it **stays**, and no second `_dmarc` record is added (two DMARC
records make receivers ignore DMARC altogether). Optional: add
`rua=mailto:kontakt@temio.pl` to this record to receive aggregate reports.

## OVH export

_(paste here if available)_
