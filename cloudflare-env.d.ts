declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SAS_DOCTRAIN_APP_KEY?: string;
  }
}
