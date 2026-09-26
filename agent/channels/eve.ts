import { eveChannel } from "eve/channels/eve";
import { ForbiddenError, localDev, type AuthFn, vercelOidc } from "eve/channels/auth";
import { auth } from "@/lib/auth";

const adminSession: AuthFn<Request> = async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) return null;

  if ((session.user as { role?: string }).role !== "admin") {
    throw new ForbiddenError({ message: "Only administrators can use the product image agent." });
  }

  return {
    attributes: {
      email: session.user.email,
      name: session.user.name,
      role: "admin",
    },
    authenticator: "better-auth",
    principalId: session.user.id,
    principalType: "user",
  };
};

export default eveChannel({
  auth: [adminSession, vercelOidc(), localDev()],
});
