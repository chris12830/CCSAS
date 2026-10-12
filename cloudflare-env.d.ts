declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SAS_DOCTRAIN_APP_KEY?: string;
    SAS_CCON_APP_KEY?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    RESEND_API_KEY?: string;
    SAS_MAIL_FROM?: string;
  }
}
