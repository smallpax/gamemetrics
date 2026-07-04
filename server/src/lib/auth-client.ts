"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client for the portal's signup/login/logout forms.
 * Talks to the handler mounted at /api/auth/*. The session cookie it relies on
 * is httpOnly — this client never sees the token directly.
 */
export const authClient = createAuthClient();

export const { signUp, signIn, signOut, useSession } = authClient;
