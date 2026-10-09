/**
 * The owner's public mailbox, shown on `/kontakt` beside the form - the channel
 * that still works when the form itself does not (e.g. its bot check is down).
 *
 * Mail for this address is hosted at OVH, not on Cloudflare: the contact form's
 * notifications go elsewhere (`CONTACT_TO`). The password-reset "nothing
 * arrived" path used to `mailto:` this address; since S-19 it links to the form.
 */
export const SUPPORT_EMAIL = "kontakt@temio.pl";
