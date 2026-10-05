const supabaseIssuer = process.env.SUPABASE_AUTH_ISSUER;

export default {
  providers: [
    ...(process.env.CONVEX_SITE_URL ? [{
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    }] : []),
    ...(supabaseIssuer ? [{
      type: "customJwt",
      issuer: supabaseIssuer,
      applicationID: "authenticated",
      jwks: `${supabaseIssuer}/.well-known/jwks.json`,
      algorithm: "ES256",
    }] : []),
  ],
};
