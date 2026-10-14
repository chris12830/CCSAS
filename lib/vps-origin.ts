// The public origin is deployment configuration, not a forwarded client header.
export function applicationOrigin(){const value=process.env.SAS_BASE_URL;if(!value)throw new Error('SAS_BASE_URL is required.');const origin=new URL(value);if(origin.protocol!=='https:')throw new Error('SAS_BASE_URL must use HTTPS.');return origin.origin;}

