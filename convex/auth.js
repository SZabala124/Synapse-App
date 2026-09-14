import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile(params) {
      return {
        email: String(params.email ?? "").trim().toLowerCase(),
        ...(String(params.firstName ?? "").trim() ? { firstName: String(params.firstName).trim() } : {}),
        ...(String(params.lastName ?? "").trim() ? { lastName: String(params.lastName).trim() } : {}),
        ...(String(params.nationalId ?? "").trim() ? { nationalId: String(params.nationalId).trim() } : {}),
        ...(String(params.phone ?? "").trim() ? { phone: String(params.phone).trim() } : {}),
        ...(Array.isArray(params.careers) ? { careers: params.careers.map(String) } : {}),
      };
    },
  }), Google],
});
